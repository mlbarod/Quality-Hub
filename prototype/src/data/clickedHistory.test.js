import { describe, expect, test, vi } from "vitest"
import { createClickRecorder } from "./clickedHistory"

describe("클릭 이력 백그라운드 전송", () => {
  test("빠른 첫 클릭도 진입 응답을 기다려 NULL 행을 지정하고 이후 클릭은 새 행으로 보낸다", async () => {
    let resolveEntry
    const fetchImpl = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveEntry = resolve })).mockResolvedValue({ status: 204 })
    const record = createClickRecorder({ fetchImpl, getHeaders: () => ({ "x-quality-hub-user-id": "visitor" }) })
    expect(record("Rule&SOP")).toBeUndefined()
    record("Rule&SOP", "변승위 category 분류")
    record("Rule&SOP", "문서 제목")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    resolveEntry({ status: 201, json: async () => ({ entryDate: "2026-09-18 09:00:00" }) })
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3))
    expect(fetchImpl.mock.calls.map(([, options]) => JSON.parse(options.body))).toEqual([
      { category: "Rule&SOP", contents: null },
      { category: "Rule&SOP", contents: "변승위 category 분류", entryDate: "2026-09-18 09:00:00" },
      { category: "Rule&SOP", contents: "문서 제목" },
    ])
    expect(fetchImpl).toHaveBeenLastCalledWith("/api/clicked-history", expect.objectContaining({
      method: "POST", keepalive: true, credentials: "same-origin",
      headers: { "Content-Type": "application/json", "x-quality-hub-user-id": "visitor" },
    }))
  })

  test("재진입은 새 NULL 행을 만들고 홈 이동 후에는 이전 진입 행을 갱신하지 않는다", async () => {
    let sequence = 0
    const fetchImpl = vi.fn(async () => ({ status: 201, json: async () => ({ entryDate: `2026-09-18 09:00:0${++sequence}` }) }))
    const record = createClickRecorder({ fetchImpl })
    record("Rule&SOP")
    record("Rule&SOP")
    record("Rule&SOP", "문서")
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3))
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).entryDate).toBe("2026-09-18 09:00:02")
    record.reset()
    record("Rule&SOP", "다른 경로로 연 문서")
    expect(JSON.parse(fetchImpl.mock.calls[3][1].body)).not.toHaveProperty("entryDate")
    record("품질 Agent", "대화 내용")
    expect(JSON.parse(fetchImpl.mock.calls[4][1].body)).toEqual({ category: "품질 Agent", contents: null })
  })

  test("진입 저장 실패 후 첫 콘텐츠는 새 행으로 전송한다", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ status: 204 })
    const record = createClickRecorder({ fetchImpl })
    record("통합 검색")
    record("통합 검색", "찾은 제목")
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ category: "통합 검색", contents: "찾은 제목" })
  })

  test("긴 제목은 100자만 전송한다", () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 204 })
    createClickRecorder({ fetchImpl })("품질 VOE", "😀".repeat(101))
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).contents).toBe("😀".repeat(100))
  })

  test("인증 만료·서버 오류·통신 실패·동기 예외가 호출자에게 전파되지 않는다", async () => {
    for (const fetchImpl of [
      vi.fn().mockResolvedValue({ status: 401 }), vi.fn().mockResolvedValue({ status: 503 }),
      vi.fn().mockRejectedValue(new Error("offline")), () => { throw new Error("keepalive limit") },
    ]) {
      expect(() => createClickRecorder({ fetchImpl })("통합 검색")).not.toThrow()
      await Promise.resolve()
    }
  })
})
