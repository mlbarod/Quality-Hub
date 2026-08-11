import { createFormattedAnswer } from "./answerFormatter.js"

const ACTIVE_CONVERSATION_KEY_PREFIX = "quality-hub.agent.active-conversation"

export class AgentChatApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.name = "AgentChatApiError"
    this.status = status
    this.code = code
  }
}

function formatConversationTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "시각 미확인"
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(date)
  }
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date)
}

function formatMessageTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(date)
}

function createIcon(href) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.classList.add("icon")
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use")
  use.setAttribute("href", href)
  svg.append(use)
  return svg
}

function getFailureMessage(status) {
  const messages = {
    rag_failed: "참고 문서를 검색하지 못했습니다.",
    gpt_failed: "답변을 생성하지 못했습니다.",
    db_failed: "대화 처리 중 DB 오류가 발생했습니다.",
  }
  return messages[status] ?? ""
}

function createMessageElement(message) {
  const article = document.createElement("article")
  const isAssistant = message.role === "assistant"
  article.className = `agent-message ${isAssistant ? "is-assistant" : "is-user"}`
  article.dataset.messageId = message.messageId ?? "pending"

  if (!isAssistant) {
    const text = document.createElement("p")
    text.textContent = message.content
    article.append(text)
    const failureMessage = getFailureMessage(message.status)
    if (failureMessage) {
      const status = document.createElement("small")
      status.className = "agent-message-status is-error"
      status.textContent = failureMessage
      article.append(status)
    }
    const time = document.createElement("time")
    time.textContent = formatMessageTime(message.createdAt)
    article.append(time)
    return article
  }

  const mark = document.createElement("span")
  mark.className = "agent-message-mark"
  mark.setAttribute("aria-hidden", "true")
  mark.textContent = "✦"
  const body = document.createElement("div")
  body.append(createFormattedAnswer(message.content))
  article.append(mark, body)
  return article
}

function createLoadingMessage() {
  const article = document.createElement("article")
  article.className = "agent-message is-assistant is-loading"
  article.setAttribute("role", "status")
  const mark = document.createElement("span")
  mark.className = "agent-message-mark"
  mark.setAttribute("aria-hidden", "true")
  mark.textContent = "✦"
  const body = document.createElement("div")
  const text = document.createElement("p")
  text.textContent = "참고 문서를 확인하고 답변을 생성하고 있습니다."
  const dots = document.createElement("span")
  dots.className = "agent-loading-dots"
  dots.setAttribute("aria-hidden", "true")
  dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"))
  body.append(text, dots)
  article.append(mark, body)
  return article
}

function createThreadState(message, { error = false } = {}) {
  const surface = document.createElement("div")
  surface.className = `agent-thread-state${error ? " is-error" : ""}`
  surface.setAttribute("role", error ? "alert" : "status")
  surface.textContent = message
  return surface
}

export function createAgentChatApiClient({ fetchImpl = globalThis.fetch, getUserId }) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch 함수가 필요합니다.")
  if (typeof getUserId !== "function") throw new TypeError("getUserId 함수가 필요합니다.")

  const request = async (path, { method = "GET", body } = {}) => {
    const response = await fetchImpl(path, {
      method,
      headers: {
        Accept: "application/json",
        "X-Quality-Hub-User-Id": getUserId(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    let payload
    try {
      payload = await response.json()
    } catch {
      throw new AgentChatApiError("서버 응답을 확인할 수 없습니다.", { status: response.status, code: "INVALID_RESPONSE" })
    }
    if (!response.ok) {
      throw new AgentChatApiError(
        payload?.error?.message ?? "품질 Agent 요청에 실패했습니다.",
        { status: response.status, code: payload?.error?.code },
      )
    }
    return payload
  }

  return {
    async listConversations() {
      return (await request("/api/agent/conversations")).conversations
    },
    async createConversation(title) {
      return (await request("/api/agent/conversations", { method: "POST", body: { title } })).conversation
    },
    async listMessages(conversationId) {
      return (await request(`/api/agent/conversations/${encodeURIComponent(conversationId)}/messages`)).messages
    },
    async ask(conversationId, question) {
      return request(`/api/agent/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        body: { question },
      })
    },
    async deleteConversation(conversationId) {
      return request(`/api/agent/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" })
    },
  }
}

export function createAgentChatController({
  root = document,
  getUserId,
  showToast = () => {},
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  confirmDelete = (message) => globalThis.confirm(message),
} = {}) {
  const api = createAgentChatApiClient({ fetchImpl, getUserId })
  const drawerThread = root.querySelector("[data-agent-drawer-thread]")
  const fullThread = root.querySelector("[data-agent-full-thread]")
  const historyList = root.querySelector("[data-agent-history-list]")
  const threadScrollContainers = [...new Set([
    drawerThread?.closest(".agent-drawer-content") ?? drawerThread,
    fullThread?.closest(".agent-main") ?? fullThread,
  ].filter((element) => element instanceof HTMLElement))]
  const forms = [...root.querySelectorAll("[data-agent-form]")]
  const inputs = [...root.querySelectorAll("[data-agent-input]")]
  const statusCopies = [...root.querySelectorAll("[data-agent-form-status]")]
  const newConversationButton = root.querySelector("[data-agent-new]")
  const state = {
    conversations: [],
    messages: [],
    activeConversationId: null,
    loadingConversations: false,
    loadingMessages: false,
    sending: false,
    pendingQuestion: "",
    error: "",
    requestVersion: 0,
  }
  let followLatestMessage = true
  let scrollScheduled = false
  let applyingScroll = false
  const requestFrame = typeof globalThis.requestAnimationFrame === "function"
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (callback) => globalThis.setTimeout(callback, 0)

  const scheduleScrollToLatest = ({ force = false } = {}) => {
    if (force) followLatestMessage = true
    if (!followLatestMessage || scrollScheduled) return
    scrollScheduled = true
    requestFrame(() => {
      scrollScheduled = false
      if (!followLatestMessage) return
      applyingScroll = true
      threadScrollContainers.forEach((container) => {
        container.scrollTop = container.scrollHeight
      })
      requestFrame(() => { applyingScroll = false })
    })
  }

  const handleConversationScroll = (event) => {
    if (applyingScroll) return
    const container = event.currentTarget
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    followLatestMessage = distanceFromBottom <= 80
  }

  threadScrollContainers.forEach((container) => container.addEventListener("scroll", handleConversationScroll, { passive: true }))
  const resizeObserver = typeof globalThis.ResizeObserver === "function"
    ? new globalThis.ResizeObserver(() => scheduleScrollToLatest())
    : null
  ;[drawerThread, fullThread].forEach((thread) => {
    if (thread instanceof HTMLElement) resizeObserver?.observe(thread)
  })

  const storageKey = () => `${ACTIVE_CONVERSATION_KEY_PREFIX}:${getUserId()}`
  const saveActiveConversation = () => {
    try {
      if (state.activeConversationId) storage?.setItem(storageKey(), state.activeConversationId)
      else storage?.removeItem(storageKey())
    } catch {
      // 브라우저 저장 제한은 DB 대화 기능을 막지 않는다.
    }
  }
  const readActiveConversation = () => {
    try {
      return storage?.getItem(storageKey()) ?? null
    } catch {
      return null
    }
  }

  const renderThreads = () => {
    ;[drawerThread, fullThread].forEach((thread) => {
      if (!(thread instanceof HTMLElement)) return
      thread.replaceChildren()
      if (state.loadingMessages) {
        thread.append(createThreadState("대화 내용을 불러오고 있습니다."))
        return
      }
      if (state.error && !state.activeConversationId) {
        thread.append(createThreadState(state.error, { error: true }))
        return
      }
      if (!state.activeConversationId) {
        thread.append(createThreadState("새 대화를 시작하거나 기존 대화를 선택해 주세요."))
        return
      }
      if (state.messages.length === 0 && !state.sending) {
        thread.append(createThreadState("아직 메시지가 없습니다. 첫 질문을 입력해 주세요."))
      } else {
        state.messages.forEach((message) => thread.append(createMessageElement(message)))
      }
      if (state.sending) {
        thread.append(createMessageElement({ role: "user", content: state.pendingQuestion, status: "processing" }))
        thread.append(createLoadingMessage())
      }
      if (state.error) thread.append(createThreadState(state.error, { error: true }))
    })
    scheduleScrollToLatest()
  }

  const renderHistory = () => {
    if (!(historyList instanceof HTMLElement)) return
    historyList.replaceChildren()
    if (state.loadingConversations) {
      historyList.append(createThreadState("대화 목록을 불러오고 있습니다."))
      return
    }
    if (state.error && !state.activeConversationId) {
      historyList.append(createThreadState(state.error, { error: true }))
      return
    }
    if (state.conversations.length === 0) {
      historyList.append(createThreadState("저장된 대화가 없습니다."))
      return
    }
    const group = document.createElement("div")
    group.className = "agent-history-group"
    const title = document.createElement("p")
    title.textContent = "최근 대화"
    group.append(title)
    state.conversations.forEach((conversation) => {
      const item = document.createElement("div")
      item.className = "agent-history-item"
      const select = document.createElement("button")
      select.type = "button"
      select.dataset.agentConversation = conversation.conversationId
      select.classList.toggle("is-current", conversation.conversationId === state.activeConversationId)
      select.setAttribute("aria-pressed", String(conversation.conversationId === state.activeConversationId))
      const label = document.createElement("span")
      const time = document.createElement("small")
      label.textContent = conversation.title
      time.textContent = formatConversationTime(conversation.updatedAt)
      select.append(label, time)
      const remove = document.createElement("button")
      remove.type = "button"
      remove.className = "agent-history-delete"
      remove.dataset.agentConversationDelete = conversation.conversationId
      remove.setAttribute("aria-label", `${conversation.title} 대화 삭제`)
      remove.append(createIcon("#icon-close"))
      item.append(select, remove)
      group.append(item)
    })
    historyList.append(group)
  }

  const renderControls = () => {
    inputs.forEach((input) => { input.disabled = state.sending })
    forms.forEach((form) => {
      const submit = form.querySelector('button[type="submit"]')
      if (submit instanceof HTMLButtonElement) submit.disabled = state.sending
      form.setAttribute("aria-busy", String(state.sending))
    })
    statusCopies.forEach((status) => {
      status.textContent = state.sending
        ? "RAG 검색과 답변 생성을 진행하고 있습니다."
        : "대화 내용은 사용자별로 저장됩니다."
    })
    if (newConversationButton instanceof HTMLButtonElement) newConversationButton.disabled = state.sending
  }

  const render = () => {
    renderThreads()
    renderHistory()
    renderControls()
  }

  const selectConversation = async (conversationId, { persist = true } = {}) => {
    const requestVersion = ++state.requestVersion
    followLatestMessage = true
    state.activeConversationId = conversationId
    state.messages = []
    state.error = ""
    state.loadingMessages = Boolean(conversationId)
    if (persist) saveActiveConversation()
    render()
    if (!conversationId) return
    try {
      const messages = await api.listMessages(conversationId)
      if (requestVersion !== state.requestVersion) return
      state.messages = Array.isArray(messages) ? messages : []
    } catch (error) {
      if (requestVersion !== state.requestVersion) return
      state.error = error instanceof Error ? error.message : "대화 내용을 불러오지 못했습니다."
    } finally {
      if (requestVersion === state.requestVersion) {
        state.loadingMessages = false
        render()
      }
    }
  }

  const loadConversations = async ({ restore = false } = {}) => {
    state.loadingConversations = true
    state.error = ""
    render()
    try {
      const conversations = await api.listConversations()
      state.conversations = Array.isArray(conversations) ? conversations : []
      const preferred = restore ? readActiveConversation() : state.activeConversationId
      const nextId = state.conversations.some((item) => item.conversationId === preferred)
        ? preferred
        : state.conversations[0]?.conversationId ?? null
      state.loadingConversations = false
      await selectConversation(nextId, { persist: true })
    } catch (error) {
      state.loadingConversations = false
      state.error = error instanceof Error ? error.message : "대화 목록을 불러오지 못했습니다."
      render()
    }
  }

  const createConversation = async (title = "새 대화") => {
    const conversation = await api.createConversation(title)
    state.conversations = [conversation, ...state.conversations.filter((item) => item.conversationId !== conversation.conversationId)]
    await selectConversation(conversation.conversationId)
    return conversation
  }

  const submitQuestion = async (question) => {
    if (state.sending) return
    followLatestMessage = true
    state.error = ""
    state.sending = true
    state.pendingQuestion = question
    inputs.forEach((input) => { input.value = "" })
    render()
    scheduleScrollToLatest({ force: true })
    try {
      if (!state.activeConversationId) await createConversation(question.slice(0, 500))
      const result = await api.ask(state.activeConversationId, question)
      if (typeof result?.assistantMessage?.content !== "string" || result.assistantMessage.content.trim().length === 0) {
        throw new AgentChatApiError("답변 내용이 비어 있습니다. 다시 질문해 주세요.", { code: "EMPTY_RESPONSE" })
      }
      state.messages = [...state.messages, result.userMessage, result.assistantMessage]
      state.sending = false
      state.pendingQuestion = ""
      render()
      try {
        const [conversations, messages] = await Promise.all([
          api.listConversations(),
          api.listMessages(state.activeConversationId),
        ])
        state.conversations = Array.isArray(conversations) ? conversations : state.conversations
        state.messages = Array.isArray(messages) ? messages : state.messages
        showToast("품질 Agent 답변을 받았습니다.")
      } catch {
        state.error = "답변은 저장되었지만 대화 목록을 새로 고치지 못했습니다. 다시 열어 확인해 주세요."
        showToast(state.error)
      }
    } catch (error) {
      state.sending = false
      state.pendingQuestion = ""
      state.error = error instanceof Error ? error.message : "답변을 처리하지 못했습니다."
      if (state.activeConversationId) {
        try {
          const messages = await api.listMessages(state.activeConversationId)
          if (Array.isArray(messages)) state.messages = messages
        } catch {
          // 원래 오류 메시지를 유지한다.
        }
      }
      showToast(state.error)
    } finally {
      render()
      const activeInput = inputs.find((input) => input.getClientRects().length > 0 && !input.closest("[inert]"))
      activeInput?.focus()
    }
  }

  forms.forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault()
    const input = form.querySelector("[data-agent-input]")
    if (!(input instanceof HTMLInputElement) || !input.value.trim()) {
      input?.focus()
      return
    }
    void submitQuestion(input.value.trim())
  }))

  newConversationButton?.addEventListener("click", async () => {
    if (state.sending) return
    try {
      await createConversation()
      showToast("새 대화를 만들었습니다.")
      inputs.find((input) => input.getClientRects().length > 0 && !input.closest("[inert]"))?.focus()
    } catch (error) {
      state.error = error instanceof Error ? error.message : "새 대화를 만들지 못했습니다."
      render()
      showToast(state.error)
    }
  })

  historyList?.addEventListener("click", async (event) => {
    const target = event.target
    if (!(target instanceof Element) || state.sending) return
    const deleteButton = target.closest("[data-agent-conversation-delete]")
    if (deleteButton instanceof HTMLButtonElement) {
      const conversation = state.conversations.find((item) => item.conversationId === deleteButton.dataset.agentConversationDelete)
      if (!conversation || !confirmDelete(`'${conversation.title}' 대화를 삭제할까요?`)) return
      try {
        await api.deleteConversation(conversation.conversationId)
        state.conversations = state.conversations.filter((item) => item.conversationId !== conversation.conversationId)
        const nextId = state.activeConversationId === conversation.conversationId
          ? state.conversations[0]?.conversationId ?? null
          : state.activeConversationId
        await selectConversation(nextId)
        showToast("대화를 삭제했습니다.")
      } catch (error) {
        state.error = error instanceof Error ? error.message : "대화를 삭제하지 못했습니다."
        render()
        showToast(state.error)
      }
      return
    }
    const selectButton = target.closest("[data-agent-conversation]")
    if (selectButton instanceof HTMLButtonElement) {
      await selectConversation(selectButton.dataset.agentConversation)
    }
  })

  return {
    state,
    async initialize() {
      await loadConversations({ restore: true })
    },
    async changeUser() {
      state.requestVersion += 1
      state.conversations = []
      state.messages = []
      state.activeConversationId = null
      state.error = ""
      await loadConversations({ restore: true })
    },
    destroy() {
      resizeObserver?.disconnect()
      threadScrollContainers.forEach((container) => container.removeEventListener("scroll", handleConversationScroll))
    },
    render,
  }
}
