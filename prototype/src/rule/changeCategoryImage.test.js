// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import {
  calculateContainedImageLayout,
  categoryImagePayloadToBlob,
  formatCategoryImageSize,
  getClipboardImageFile,
  imageFileToPayload,
  renderCategoryImage,
} from "./changeCategoryImage.js"

describe("변승위 Category 그림 붙여넣기", () => {
  it("클립보드에서 지원하는 그림 파일 한 개를 선택한다", () => {
    const image = new File([new Uint8Array([0x89])], "category.png", { type: "image/png" })
    const clipboardData = { items: [{ kind: "string", type: "text/plain" }, { kind: "file", type: "image/png", getAsFile: () => image }] }
    expect(getClipboardImageFile(clipboardData)).toBe(image)
    expect(() => getClipboardImageFile({ items: [] })).toThrow("복사한 그림을 찾지 못했습니다")
  })

  it("원본 비율을 유지하며 1280×600 표시 영역 중앙에 맞춘다", () => {
    expect(calculateContainedImageLayout(1920, 1080)).toEqual({ x: 107, y: 0, width: 1067, height: 600 })
    expect(calculateContainedImageLayout(800, 1200)).toEqual({ x: 440, y: 0, width: 400, height: 600 })
  })

  it("원본을 1280×600 PNG로 정규화해 저장 payload를 만든다", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const file = new File([bytes], "category.png", { type: "image/png" })
    const payload = await imageFileToPayload(file, { normalizeImage: async () => new Blob([bytes], { type: "image/png" }) })
    expect(payload).toEqual({ name: "change-category.png", type: "image/png", width: 1280, height: 600, dataBase64: "iVBORw0KGgo=" })
    expect(categoryImagePayloadToBlob(payload)).toBeInstanceOf(Blob)
    await expect(imageFileToPayload(new File(["wrong"], "wrong.png", { type: "image/png" }), { normalizeImage: async () => new Blob([bytes], { type: "image/png" }) })).rejects.toThrow("파일 형식이 일치하지 않습니다")
  })

  it("그림은 안전한 img 요소로 표시한다", () => {
    const container = document.createElement("div")
    expect(renderCategoryImage(container, "blob:test-image")).toBe(true)
    expect(container.querySelector("img")?.alt).toBe("변승위 Category 분류표")
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:test-image")
    expect(formatCategoryImageSize(1536)).toBe("2 KB")
  })
})
