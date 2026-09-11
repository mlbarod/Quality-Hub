import { createSessionAwareFetch } from "@/auth/sessionClient"
import { LOCAL_DATA_EVENT } from "@/data/localRepository"
import { initialNotifications, initialPosts } from "@/qna/data"
import { MAX_QNA_HTML_BYTES, MAX_QNA_REQUEST_BYTES, QNA_SIZE_MESSAGE } from "../../../server/qnaLimits.mjs"
import { qnaFailureMessage } from "./errors"

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
let cacheIdentity = null
let loadedAt = 0
let revision = 0
let pendingSnapshot = null
const pendingDetails = new Map()

function ensureIdentity() {
  const identity = getIdentity()
  const key = `${identity.isSsoMode}:${identity.userId}:${identity.role}`
  if (cacheIdentity !== key) {
    cacheIdentity = key
    cachedSnapshot = structuredClone(isTestMode ? testSeed : emptySnapshot)
    loadedAt = 0
    revision++
    pendingSnapshot = null
    pendingDetails.clear()
  }
  return key
}

function publishMutation(update) {
  revision++
  loadedAt = 0
  dispatchSnapshot(update(cachedSnapshot))
  return structuredClone(cachedSnapshot)
}

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
  return async (path, { method = "GET", body } = {}) => {
    // 저장 중 로그인 만료는 작성창을 유지한 채 안내한다. 조회의 기존 로그인 이동은 유지한다.
    const fetchImpl = createSessionAwareFetch({ isSsoMode: identity.isSsoMode && method === "GET" })
    const json = body === undefined ? undefined : JSON.stringify(body)
    if ((typeof body?.bodyHtml === "string" && new Blob([body.bodyHtml]).size > MAX_QNA_HTML_BYTES) || (json && new Blob([json]).size > MAX_QNA_REQUEST_BYTES)) {
      throw new QnaRepositoryError(QNA_SIZE_MESSAGE, { status: 413, code: "BODY_TOO_LARGE" })
    }
    const headers = { Accept: "application/json" }
    if (body !== undefined) headers["Content-Type"] = "application/json"
    if (!identity.isSsoMode) {
      headers["x-quality-hub-user-id"] = identity.userId
      headers["x-quality-hub-user-name"] = encodeURIComponent(identity.displayName)
      headers["x-quality-hub-role"] = identity.role
    }
    let response
    try { response = await fetchImpl(path, { method, headers, body: json }) } catch (error) {
      if (error?.code === "AUTHENTICATION_REDIRECT") throw error
      throw new QnaRepositoryError(qnaFailureMessage({ code: "NETWORK_ERROR" }), { code: "NETWORK_ERROR" })
    }
    let payload
    try { payload = await response.json() } catch {
      if (response.ok) throw new QnaRepositoryError(qnaFailureMessage({ code: "INVALID_RESPONSE" }), { code: "INVALID_RESPONSE" })
    }
    if (!response.ok) {
      const details = { status: response.status, code: payload?.error?.code, message: payload?.error?.message }
      throw new QnaRepositoryError(qnaFailureMessage(details), details)
    }
    return payload
  }
}

async function mutate(path, body, method = "PATCH") {
  await createRequest()(path, { method, body })
  revision++
  loadedAt = 0
  return qnaRepository.getSnapshot({ force: true })
}

function testResult() {
  dispatchSnapshot(cachedSnapshot)
  return Promise.resolve(structuredClone(cachedSnapshot))
}

export const qnaRepository = {
  key: "qna",
  read() {
    ensureIdentity()
    return structuredClone(cachedSnapshot)
  },
  async getSnapshot({ force = false } = {}) {
    const identity = ensureIdentity()
    if (isTestMode) return structuredClone(cachedSnapshot)
    if (!force && loadedAt && Date.now() - loadedAt < 15000) return this.read()
    if (pendingSnapshot?.revision === revision) return pendingSnapshot.promise
    const requestRevision = revision
    const request = { revision, promise: null }
    request.promise = createRequest()("/api/qna?summary=1").then((snapshot) => {
      if (ensureIdentity() !== identity || requestRevision !== revision) return this.read()
      snapshot.posts = snapshot.posts.map((post) => {
        const previous = cachedSnapshot.posts.find((item) => item.questionId === post.questionId)
        return previous?.detailLoaded && previous.updatedAt === post.updatedAt ? { ...post, content: previous.content, messages: previous.messages, detailLoaded: true } : post
      })
      dispatchSnapshot(snapshot)
      loadedAt = Date.now()
      return this.read()
    }).finally(() => { if (pendingSnapshot === request) pendingSnapshot = null })
    pendingSnapshot = request
    return request.promise
  },
  async getQuestion(questionId) {
    const identity = ensureIdentity()
    if (isTestMode) return this.read()
    const requestRevision = revision
    const key = `${identity}:${requestRevision}:${questionId}`
    if (pendingDetails.has(key)) return pendingDetails.get(key)
    const promise = createRequest()(`/api/qna/questions/${encodeURIComponent(questionId)}`).then(({ post }) => {
      if (ensureIdentity() !== identity || requestRevision !== revision) return this.read()
      dispatchSnapshot({ ...cachedSnapshot, posts: cachedSnapshot.posts.map((item) => item.questionId === post.questionId ? post : item) })
      return this.read()
    }).finally(() => pendingDetails.delete(key))
    pendingDetails.set(key, promise)
    return promise
  },
  async createQuestion(input) {
    const identity = ensureIdentity()
    if (isTestMode) {
      const nextId = Math.max(0, ...cachedSnapshot.posts.map((post) => post.questionId)) + 1
      cachedSnapshot.posts.unshift({ id: `Q-2026-${String(nextId).padStart(3, "0")}`, questionId: nextId, title: input.title, excerpt: "", category: input.category, line: input.lineName, tags: input.tags, status: "waiting", author: getIdentity().displayName, authorUserId: getIdentity().userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), views: 0, content: input.bodyHtml, attachments: [], messages: [] })
      return testResult()
    }
    const { post } = await createRequest()("/api/qna/questions", { method: "POST", body: input })
    if (ensureIdentity() !== identity) return this.read()
    return publishMutation((snapshot) => ({ ...snapshot, posts: [post, ...snapshot.posts.filter((item) => item.questionId !== post.questionId)] }))
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
    if (input.operation === "view") {
      const identity = ensureIdentity()
      await createRequest()(`/api/qna/questions/${encodeURIComponent(questionId)}`, { method: "PATCH", body: input })
      if (ensureIdentity() !== identity) return this.read()
      dispatchSnapshot({ ...cachedSnapshot, posts: cachedSnapshot.posts.map((post) => post.questionId === Number(questionId) ? { ...post, views: post.views + 1 } : post) })
      return this.read()
    }
    loadedAt = 0
    revision++
    return mutate(`/api/qna/questions/${encodeURIComponent(questionId)}`, input)
  },
  async createMessage(questionId, input) {
    const identity = ensureIdentity()
    if (isTestMode) {
      cachedSnapshot.posts = cachedSnapshot.posts.map((post) => post.questionId === Number(questionId) ? { ...post, status: post.status === "waiting" ? "active" : post.status, messages: [...post.messages, { id: `m-${Date.now()}`, messageId: Date.now(), author: getIdentity().displayName, authorUserId: getIdentity().userId, role: "답변·댓글", time: new Date().toISOString(), body: input.bodyHtml.replace(/<[^>]+>/g, " ").trim(), content: input.bodyHtml }] } : post)
      return testResult()
    }
    const { message, questionStatus } = await createRequest()(`/api/qna/questions/${encodeURIComponent(questionId)}/messages`, { method: "POST", body: input })
    if (ensureIdentity() !== identity) return this.read()
    return publishMutation((snapshot) => ({ ...snapshot, posts: snapshot.posts.map((post) => post.questionId === Number(questionId) ? { ...post, status: questionStatus, updatedAt: message.time, messages: [...post.messages, message] } : post) }))
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
    ensureIdentity()
    revision++
    loadedAt = 0
    pendingSnapshot = null
    dispatchSnapshot(isTestMode ? testSeed : emptySnapshot)
  },
  write(snapshot) {
    ensureIdentity()
    if (!isTestMode) throw new QnaRepositoryError("운영 품질VOE 데이터는 로컬 저장소에 쓸 수 없습니다.")
    dispatchSnapshot(normalizeTestSnapshot(snapshot))
    return this.read()
  },
}
