import { createQnaRepository, QnaNotFoundError, QnaPermissionError } from "./qnaRepository.mjs"

const API_PATH = "/api/qna"
const MAX_JSON_BODY_BYTES = 600 * 1024
const ROLES = new Set(["master", "admin", "general"])

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  })
  res.end(body)
}

export class QnaApiRequestError extends Error {
  constructor(message, { status = 400, code = "BAD_REQUEST" } = {}) {
    super(message)
    this.name = "QnaApiRequestError"
    this.status = status
    this.code = code
  }
}

function singleHeader(req, name) {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function requireActor(req) {
  const userId = singleHeader(req, "x-quality-hub-user-id")?.trim()
  const displayName = decodeURIComponent(singleHeader(req, "x-quality-hub-user-name")?.trim() || userId || "")
  const role = singleHeader(req, "x-quality-hub-role")?.trim()
  if (!userId || userId.length > 100 || !displayName || displayName.length > 100 || !ROLES.has(role)) {
    throw new QnaApiRequestError("Q&A 사용자 식별 정보가 필요합니다.", { status: 401, code: "USER_REQUIRED" })
  }
  return { userId, displayName, role }
}

async function readJsonBody(req) {
  const chunks = []
  let byteLength = 0
  for await (const chunk of req) {
    byteLength += chunk.length
    if (byteLength > MAX_JSON_BODY_BYTES) throw new QnaApiRequestError("요청 내용이 너무 큽니다.", { status: 413, code: "BODY_TOO_LARGE" })
    chunks.push(chunk)
  }
  if (byteLength === 0) return {}
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError()
    return value
  } catch {
    throw new QnaApiRequestError("JSON 요청 형식이 올바르지 않습니다.", { status: 400, code: "INVALID_JSON" })
  }
}

function parseRoute(req) {
  let url
  try {
    url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
  } catch {
    return null
  }
  if (url.pathname === API_PATH) return { type: "snapshot" }
  if (url.pathname === `${API_PATH}/questions`) return { type: "questions" }
  if (url.pathname === `${API_PATH}/notifications`) return { type: "notifications" }
  const parts = url.pathname.slice(API_PATH.length + 1).split("/").map((part) => decodeURIComponent(part))
  if (parts[0] !== "questions" || !/^\d+$/.test(parts[1] ?? "")) return null
  const questionId = Number(parts[1])
  if (parts.length === 2) return { type: "question", questionId }
  if (parts[2] !== "messages") return null
  if (parts.length === 3) return { type: "messages", questionId }
  if (parts.length === 4 && /^\d+$/.test(parts[3])) return { type: "message", questionId, messageId: Number(parts[3]) }
  return null
}

function toApiError(error) {
  if (error instanceof QnaApiRequestError) return error
  if (error instanceof QnaNotFoundError) return new QnaApiRequestError(error.message, { status: 404, code: "QNA_NOT_FOUND" })
  if (error instanceof QnaPermissionError) return new QnaApiRequestError(error.message, { status: 403, code: "QNA_FORBIDDEN" })
  if (error instanceof TypeError || error instanceof URIError) return new QnaApiRequestError(error.message, { status: 400, code: "INVALID_INPUT" })
  if (error && typeof error === "object" && ("sqlState" in error || "errno" in error || "fatal" in error)) {
    return new QnaApiRequestError("Q&A DB 요청을 처리하지 못했습니다.", { status: 503, code: "DB_FAILED" })
  }
  return new QnaApiRequestError("Q&A 요청을 처리하지 못했습니다.", { status: 500, code: "INTERNAL_ERROR" })
}

export function createQnaApi({ repository, repositoryFactory = createQnaRepository, logger = console } = {}) {
  let activeRepository = repository
  let ownsRepository = false
  const getRepository = () => {
    if (!activeRepository) {
      try {
        activeRepository = repositoryFactory()
      } catch {
        throw new QnaApiRequestError("Q&A DB 연결 설정을 확인해 주세요.", { status: 503, code: "DB_FAILED" })
      }
      ownsRepository = true
    }
    return activeRepository
  }

  return {
    async handle(req, res) {
      let route
      try {
        route = parseRoute(req)
      } catch (error) {
        const apiError = toApiError(error)
        sendJson(res, apiError.status, { error: { code: apiError.code, message: apiError.message } })
        return true
      }
      if (!route) return false
      try {
        const actor = requireActor(req)
        const method = req.method ?? "GET"
        if (method === "GET" && route.type === "snapshot") {
          sendJson(res, 200, await getRepository().getSnapshot(actor))
          return true
        }
        if (method === "POST" && route.type === "questions") {
          const result = await getRepository().createQuestion(await readJsonBody(req), actor)
          sendJson(res, 201, result)
          return true
        }
        if (method === "PATCH" && route.type === "question") {
          sendJson(res, 200, await getRepository().updateQuestion(route.questionId, await readJsonBody(req), actor))
          return true
        }
        if (method === "POST" && route.type === "messages") {
          const result = await getRepository().createMessage(route.questionId, await readJsonBody(req), actor)
          sendJson(res, 201, result)
          return true
        }
        if (method === "PATCH" && route.type === "message") {
          sendJson(res, 200, await getRepository().updateMessage(route.questionId, route.messageId, await readJsonBody(req), actor))
          return true
        }
        if (method === "PATCH" && route.type === "notifications") {
          sendJson(res, 200, await getRepository().markNotificationsRead(await readJsonBody(req), actor))
          return true
        }
        const allow = route.type === "snapshot" ? "GET" : route.type === "questions" || route.type === "messages" ? "POST" : "PATCH"
        sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "지원하지 않는 Q&A API 요청입니다." } }, { Allow: allow })
        return true
      } catch (error) {
        const apiError = toApiError(error)
        if (apiError.status >= 500 && typeof logger?.error === "function") {
          logger.error("Q&A API failure", {
            method: req.method ?? "GET",
            routeType: route.type,
            apiCode: apiError.code,
            status: apiError.status,
            errorName: error?.name,
            dbCode: error?.code,
            errno: error?.errno,
            sqlState: error?.sqlState,
          })
        }
        sendJson(res, apiError.status, { error: { code: apiError.code, message: apiError.message } })
        return true
      }
    },

    async close() {
      if (ownsRepository && activeRepository) await activeRepository.close()
    },
  }
}
