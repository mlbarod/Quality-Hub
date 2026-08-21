import { createSessionAwareFetch } from "@/auth/sessionClient"
import { LOCAL_DATA_EVENT } from "@/data/localRepository"
import { initialNotifications, initialPosts } from "@/qna/data"

const emptySnapshot = { posts: [], notifications: [], history: [] }
const isTestMode = import.meta.env.MODE === "test"

function normalizeTestSnapshot(snapshot) {
  return {
    posts: snapshot.posts.map((post, postIndex) => ({
      ...post,
      questionId: post.questionId ?? postIndex + 1,
      authorUserId: post.authorUserId ?? (post.author === "김품질" ? "quality.kim" : `test-author-${postIndex}`),
      messages: (post.messages ?? []).map((message, messageIndex) => ({
        ...message,
        messageId: message.messageId ?? messageIndex + 1,
        authorUserId: message.authorUserId ?? `test-message-author-${messageIndex}`,
      })),
    })),
    notifications: snapshot.notifications ?? [],
    history: snapshot.history ?? [],
  }
}

const testSeed = normalizeTestSnapshot({ posts: initialPosts, notifications: initialNotifications, history: [] })
let cachedSnapshot = structuredClone(isTestMode ? testSeed : emptySnapshot)

export class QnaRepositoryError extends Error {
  constructor(message, { status = 0, code = "QNA_REQUEST_FAILED" } = {}) {
    super(message)
    this.name = "QnaRepositoryError"
    this.status = status
    this.code = code
  }
}

function getIdentity() {
  const prototype = document.querySelector(".prototype")
  const role = prototype?.dataset.currentRole ?? "master"
  const user = window.__qualityHubCurrentUser
  const fallback = {
    master: { userId: "quality.kim", name: "김품질" },
    admin: { userId: "process.park", name: "박공정" },
    general: { userId: "analysis.lee", name: "이분석" },
  }[role] ?? { userId: "", name: "" }
  return {
    role,
    userId: user?.userId ?? fallback.userId,
    displayName: user?.name ?? fallback.name,
    isSsoMode: prototype?.dataset.authMode === "sso",
  }
}

function dispatchSnapshot(snapshot) {
  cachedSnapshot = structuredClone(snapshot)
  window.dispatchEvent(new CustomEvent(LOCAL_DATA_EVENT, { detail: { key: "qna", data: cachedSnapshot } }))
}

function createRequest() {
  const identity = getIdentity()
  const fetchImpl = createSessionAwareFetch({ isSsoMode: identity.isSsoMode })
  return async (path, { method = "GET", body } = {}) => {
    const headers = { Accept: "application/json" }
    if (body !== undefined) headers["Content-Type"] = "application/json"
    if (!identity.isSsoMode) {
      headers["x-quality-hub-user-id"] = identity.userId
      headers["x-quality-hub-user-name"] = encodeURIComponent(identity.displayName)
      headers["x-quality-hub-role"] = identity.role
    }
    const response = await fetchImpl(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new QnaRepositoryError(payload.error?.message ?? "Q&A DB 요청을 처리하지 못했습니다.", { status: response.status, code: payload.error?.code })
    return payload
  }
}

async function mutate(path, body, method = "PATCH") {
  await createRequest()(path, { method, body })
  return qnaRepository.getSnapshot()
}

function testResult() {
  dispatchSnapshot(cachedSnapshot)
  return Promise.resolve(structuredClone(cachedSnapshot))
}

export const qnaRepository = {
  key: "qna",
  read() {
    return structuredClone(cachedSnapshot)
  },
  async getSnapshot() {
    if (isTestMode) return structuredClone(cachedSnapshot)
    const snapshot = await createRequest()("/api/qna")
    dispatchSnapshot(snapshot)
    return structuredClone(snapshot)
  },
  async createQuestion(input) {
    if (isTestMode) {
      const nextId = Math.max(0, ...cachedSnapshot.posts.map((post) => post.questionId)) + 1
      cachedSnapshot.posts.unshift({ id: `Q-2026-${String(nextId).padStart(3, "0")}`, questionId: nextId, title: input.title, excerpt: "", category: input.category, line: input.lineName, tags: input.tags, status: "waiting", author: getIdentity().displayName, authorUserId: getIdentity().userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), views: 0, content: input.bodyHtml, attachments: [], messages: [] })
      return testResult()
    }
    await createRequest()("/api/qna/questions", { method: "POST", body: input })
    return this.getSnapshot()
  },
  async updateQuestion(questionId, input) {
    if (isTestMode) {
      cachedSnapshot.posts = cachedSnapshot.posts.map((post) => {
        if (post.questionId !== Number(questionId)) return post
        if (input.operation === "view") return { ...post, views: post.views + 1 }
        if (input.operation === "hide") return { ...post, hidden: true, hiddenAt: new Date().toISOString(), hiddenBy: getIdentity().displayName }
        if (input.operation === "restore") return { ...post, hidden: false, hiddenAt: undefined, hiddenBy: undefined }
        if (input.operation === "status") return { ...post, status: input.status }
        if (input.operation === "final") return { ...post, status: "completed", messages: post.messages.map((message) => ({ ...message, isFinal: message.messageId === Number(input.messageId) })) }
        return { ...post, title: input.title, content: input.bodyHtml }
      })
      return testResult()
    }
    return mutate(`/api/qna/questions/${encodeURIComponent(questionId)}`, input)
  },
  async createMessage(questionId, input) {
    if (isTestMode) {
      cachedSnapshot.posts = cachedSnapshot.posts.map((post) => post.questionId === Number(questionId) ? { ...post, status: post.status === "waiting" ? "active" : post.status, messages: [...post.messages, { id: `m-${Date.now()}`, messageId: Date.now(), author: getIdentity().displayName, authorUserId: getIdentity().userId, role: "답변·댓글", time: new Date().toISOString(), body: input.bodyHtml.replace(/<[^>]+>/g, " ").trim(), content: input.bodyHtml }] } : post)
      return testResult()
    }
    await createRequest()(`/api/qna/questions/${encodeURIComponent(questionId)}/messages`, { method: "POST", body: input })
    return this.getSnapshot()
  },
  async updateMessage(questionId, messageId, input) {
    if (isTestMode) {
      cachedSnapshot.posts = cachedSnapshot.posts.map((post) => post.questionId === Number(questionId) ? { ...post, messages: post.messages.map((message) => {
        if (message.messageId !== Number(messageId)) return message
        if (input.operation === "hide") return { ...message, hidden: true }
        if (input.operation === "restore") return { ...message, hidden: false }
        return { ...message, content: input.bodyHtml, body: input.bodyHtml.replace(/<[^>]+>/g, " ").trim() }
      }) } : post)
      return testResult()
    }
    return mutate(`/api/qna/questions/${encodeURIComponent(questionId)}/messages/${encodeURIComponent(messageId)}`, input)
  },
  async markNotificationRead(notificationId) {
    if (isTestMode) {
      cachedSnapshot.notifications = cachedSnapshot.notifications.map((item) => item.id === notificationId ? { ...item, read: true } : item)
      return testResult()
    }
    return mutate("/api/qna/notifications", { notificationId })
  },
  async markAllNotificationsRead() {
    if (isTestMode) {
      cachedSnapshot.notifications = cachedSnapshot.notifications.map((item) => ({ ...item, read: true }))
      return testResult()
    }
    return mutate("/api/qna/notifications", { all: true })
  },
  reset() {
    dispatchSnapshot(isTestMode ? testSeed : emptySnapshot)
  },
  write(snapshot) {
    if (!isTestMode) throw new QnaRepositoryError("운영 Q&A 데이터는 로컬 저장소에 쓸 수 없습니다.")
    dispatchSnapshot(normalizeTestSnapshot(snapshot))
    return this.read()
  },
}
