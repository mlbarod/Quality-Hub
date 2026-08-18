// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import {
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

  it("원본 파일 형식과 해상도를 그대로 유지해 저장 payload를 만든다", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const file = new File([bytes], "category.png", { type: "image/png" })
    const payload = await imageFileToPayload(file, { getDimensions: async () => ({ width: 960, height: 1440 }) })
    expect(payload).toEqual({ name: "category.png", type: "image/png", width: 960, height: 1440, dataBase64: "iVBORw0KGgo=" })
    await expect(imageFileToPayload(new File(["wrong"], "wrong.png", { type: "image/png" }), { getDimensions: async () => ({ width: 1, height: 1 }) })).rejects.toThrow("파일 형식이 일치하지 않습니다")
    await expect(imageFileToPayload(file, { getDimensions: async () => ({ width: 20_001, height: 100 }) })).rejects.toThrow("20,000px 이하")
  })

  it("그림은 안전한 img 요소로 표시한다", () => {
    const container = document.createElement("div")
    expect(renderCategoryImage(container, "blob:test-image")).toBe(true)
    expect(container.querySelector("img")?.alt).toBe("변승위 Category 분류표")
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:test-image")
    expect(formatCategoryImageSize(1536)).toBe("2 KB")
  })
})
