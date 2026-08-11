import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAgentChatApiClient,
  createAgentChatController,
} from "./chatController.js"

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function renderFixture() {
  document.body.innerHTML = `
    <section data-agent-drawer-thread></section>
    <section data-agent-full-thread></section>
    <div data-agent-history-list></div>
    <section data-agent-context-sources></section>
    <button type="button" data-agent-new>새 대화</button>
    <button type="button" data-agent-sources-refresh>새로고침</button>
    <form data-agent-form><input data-agent-input><button type="submit">전송</button><small data-agent-form-status></small></form>
    <form data-agent-form><input data-agent-input><button type="submit">전송</button><small data-agent-form-status></small></form>
  `
}

beforeEach(() => {
  renderFixture()
  localStorage.clear()
})

describe("Quality Agent API Client", () => {
  it("현재 테스트 user_id Header와 conversation 경로를 사용한다", async () => {
    const calls = []
    const fetchImpl = vi.fn(async (url, options) => {
      calls.push({ url, options })
      return jsonResponse({ messages: [] })
    })
    const api = createAgentChatApiClient({ fetchImpl, getUserId: () => "quality.kim" })

    await api.listMessages("conversation/한글")

    expect(calls[0].url).toBe("/api/agent/conversations/conversation%2F%ED%95%9C%EA%B8%80/messages")
    expect(calls[0].options.headers["X-Quality-Hub-User-Id"]).toBe("quality.kim")
    expect(calls[0].options.headers.Accept).toBe("application/json")
  })
})

describe("Quality Agent 공유 대화 상태", () => {
  it("초기 대화 목록 조회 실패를 빈 상태로 숨기지 않고 안내한다", async () => {
    const controller = createAgentChatController({
      fetchImpl: vi.fn(async () => jsonResponse({
        error: { code: "DB_FAILED", message: "대화 DB에 연결하지 못했습니다." },
      }, 503)),
      getUserId: () => "quality.kim",
      storage: localStorage,
    })

    await controller.initialize()

    expect(document.querySelector("[data-agent-drawer-thread]").textContent).toContain("대화 DB에 연결하지 못했습니다.")
    expect(document.querySelector("[data-agent-full-thread]").textContent).toContain("대화 DB에 연결하지 못했습니다.")
    expect(document.querySelector("[data-agent-history-list]").textContent).toContain("대화 DB에 연결하지 못했습니다.")
  })

  it("새로고침 시 선택 대화와 History를 복원하고 두 화면에 안전한 텍스트로 렌더링한다", async () => {
    const maliciousContent = '<img src=x onerror="window.hacked=true"> 답변'
    localStorage.setItem("quality-hub.agent.active-conversation:quality.kim", "conversation-2")
    const fetchImpl = vi.fn(async (url) => {
      if (url === "/api/agent/conversations") {
        return jsonResponse({ conversations: [
          { conversationId: "conversation-1", title: "첫 대화", updatedAt: "2026-08-11T01:00:00Z" },
          { conversationId: "conversation-2", title: "복원 대화", updatedAt: "2026-08-11T02:00:00Z" },
        ] })
      }
      return jsonResponse({
        messages: [
          { messageId: "m1", role: "user", content: "질문", status: "completed", createdAt: "2026-08-11T02:00:00Z", ragSources: [] },
          { messageId: "m2", role: "assistant", content: maliciousContent, status: "completed", createdAt: "2026-08-11T02:00:01Z", ragSources: [{ _id: "doc-1", _source: { title: "기준 문서" } }] },
        ],
      })
    })
    const controller = createAgentChatController({
      fetchImpl,
      getUserId: () => "quality.kim",
      storage: localStorage,
    })

    await controller.initialize()

    expect(controller.state.activeConversationId).toBe("conversation-2")
    expect(document.querySelector('[data-agent-conversation="conversation-2"]').classList.contains("is-current")).toBe(true)
    for (const thread of document.querySelectorAll("[data-agent-drawer-thread], [data-agent-full-thread]")) {
      expect(thread.textContent).toContain(maliciousContent)
      expect(thread.querySelector("img")).toBeNull()
      expect(thread.querySelectorAll(".agent-message")).toHaveLength(2)
      expect(thread.textContent).toContain("기준 문서")
    }
    expect(document.querySelector("[data-agent-context-sources]").textContent).toContain("기준 문서")
    expect(window.hacked).not.toBe(true)
  })

  it("질문 전송 중 로딩을 표시하고 새 대화·답변·출처·updated_at 목록을 함께 갱신한다", async () => {
    let conversationCreated = false
    let answerRequested = false
    let resolveAnswer
    const answerResponse = new Promise((resolve) => { resolveAnswer = resolve })
    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (url === "/api/agent/conversations" && options.method === "POST") {
        conversationCreated = true
        return jsonResponse({ conversation: { conversationId: "conversation-1", title: "현재 질문", updatedAt: "2026-08-11T03:00:00Z" } }, 201)
      }
      if (url === "/api/agent/conversations" && !options.method) {
        return jsonResponse({ conversations: conversationCreated
          ? [{ conversationId: "conversation-1", title: "현재 질문", updatedAt: answerRequested ? "2026-08-11T03:01:00Z" : "2026-08-11T03:00:00Z" }]
          : [] })
      }
      if (url.endsWith("/messages") && options.method === "POST") {
        answerRequested = true
        await answerResponse
        return jsonResponse({
          userMessage: { messageId: "user-1", role: "user", content: "현재 질문", status: "completed", ragSources: [] },
          assistantMessage: { messageId: "assistant-1", role: "assistant", content: "실제 답변", status: "completed", ragSources: [{ _id: "doc-1" }] },
        })
      }
      if (url.endsWith("/messages")) {
        return jsonResponse({ messages: answerRequested
          ? [
            { messageId: "user-1", role: "user", content: "현재 질문", status: "completed", ragSources: [] },
            { messageId: "assistant-1", role: "assistant", content: "실제 답변", status: "completed", ragSources: [{ _id: "doc-1" }] },
          ]
          : [] })
      }
      throw new Error(`예상하지 못한 요청: ${url}`)
    })
    const controller = createAgentChatController({
      fetchImpl,
      getUserId: () => "quality.kim",
      storage: localStorage,
    })
    await controller.initialize()

    const form = document.querySelector("[data-agent-form]")
    const input = form.querySelector("[data-agent-input]")
    input.value = "현재 질문"
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(document.querySelector("[data-agent-drawer-thread]").textContent).toContain("답변을 생성하고 있습니다")
      expect(input.disabled).toBe(true)
    })

    resolveAnswer()
    await vi.waitFor(() => {
      expect(controller.state.sending).toBe(false)
      expect(document.querySelector("[data-agent-drawer-thread]").textContent).toContain("실제 답변")
      expect(document.querySelector("[data-agent-full-thread]").textContent).toContain("실제 답변")
      expect(document.querySelector("[data-agent-history-list]").textContent).toContain("현재 질문")
      expect(document.querySelector("[data-agent-context-sources]").textContent).toContain("doc-1")
    })
    expect(localStorage.getItem("quality-hub.agent.active-conversation:quality.kim")).toBe("conversation-1")
  })

  it("대화 삭제 후 다음 대화를 같은 공유 상태로 선택한다", async () => {
    const conversations = [
      { conversationId: "conversation-1", title: "삭제할 대화", updatedAt: "2026-08-11T03:00:00Z" },
      { conversationId: "conversation-2", title: "남은 대화", updatedAt: "2026-08-11T02:00:00Z" },
    ]
    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (url === "/api/agent/conversations") return jsonResponse({ conversations })
      if (options.method === "DELETE") return jsonResponse({ deleted: true, conversationId: "conversation-1" })
      if (url.endsWith("/messages")) return jsonResponse({ messages: [] })
      throw new Error(`예상하지 못한 요청: ${url}`)
    })
    const controller = createAgentChatController({
      fetchImpl,
      getUserId: () => "quality.kim",
      storage: localStorage,
      confirmDelete: () => true,
    })
    await controller.initialize()

    document.querySelector('[data-agent-conversation-delete="conversation-1"]').click()
    await vi.waitFor(() => expect(controller.state.activeConversationId).toBe("conversation-2"))
    expect(document.querySelector('[data-agent-conversation="conversation-1"]')).toBeNull()
  })
})
