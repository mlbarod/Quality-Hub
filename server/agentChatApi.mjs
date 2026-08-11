import {
  BackendChatDbError,
  BackendChatGptOssError,
  BackendChatRagError,
  createBackendChatService,
} from "./backendChatService.mjs"
import {
  ConversationAccessError,
  createConversationHistoryRepository,
  MessageAccessError,
} from "./conversationHistoryRepository.mjs"

const API_PREFIX = "/api/agent"
const MAX_JSON_BODY_BYTES = 64 * 1024

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  })
  res.end(body)
}

function requireUserId(req) {
  const header = req.headers["x-quality-hub-user-id"]
  const userId = Array.isArray(header) ? header[0] : header
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.length > 100) {
    throw new AgentApiRequestError("테스트 사용자 식별 정보가 필요합니다.", { status: 401, code: "USER_ID_REQUIRED" })
  }
  return userId.trim()
}

async function readJsonBody(req) {
  const chunks = []
  let byteLength = 0
  for await (const chunk of req) {
    byteLength += chunk.length
    if (byteLength > MAX_JSON_BODY_BYTES) {
      throw new AgentApiRequestError("요청 내용이 너무 큽니다.", { status: 413, code: "BODY_TOO_LARGE" })
    }
    chunks.push(chunk)
  }

  if (byteLength === 0) return {}
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError()
    return value
  } catch {
    throw new AgentApiRequestError("JSON 요청 형식이 올바르지 않습니다.", { status: 400, code: "INVALID_JSON" })
  }
}

function parseRagSources(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== "string" || value.length === 0) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function normalizeAgentMessage(message) {
  return {
    ...message,
    ragUsed: message.ragUsed === true || message.ragUsed === 1,
    ragSources: parseRagSources(message.ragSources),
  }
}

export class AgentApiRequestError extends Error {
  constructor(message, { status = 400, code = "BAD_REQUEST" } = {}) {
    super(message)
    this.name = "AgentApiRequestError"
    this.status = status
    this.code = code
  }
}

function toApiError(error) {
  if (error instanceof AgentApiRequestError) return error
  if (error instanceof ConversationAccessError || error instanceof MessageAccessError) {
    return new AgentApiRequestError("대화를 찾을 수 없거나 접근 권한이 없습니다.", {
      status: 404,
      code: "CONVERSATION_NOT_FOUND",
    })
  }
  if (error instanceof BackendChatRagError) {
    return new AgentApiRequestError("참고 문서를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.", {
      status: 502,
      code: "RAG_FAILED",
    })
  }
  if (error instanceof BackendChatGptOssError) {
    return new AgentApiRequestError("답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.", {
      status: 502,
      code: "GPT_OSS_FAILED",
    })
  }
  if (error instanceof BackendChatDbError) {
    return new AgentApiRequestError("대화 내용을 저장하거나 불러오지 못했습니다.", {
      status: 503,
      code: "DB_FAILED",
    })
  }
  if (error instanceof TypeError) {
    return new AgentApiRequestError(error.message, { status: 400, code: "INVALID_INPUT" })
  }
  if (error && typeof error === "object" && ("sqlState" in error || "errno" in error || "fatal" in error)) {
    return new AgentApiRequestError("대화 DB에 연결하거나 요청을 처리하지 못했습니다.", {
      status: 503,
      code: "DB_FAILED",
    })
  }
  return new AgentApiRequestError("품질 Agent 요청을 처리하지 못했습니다.", {
    status: 500,
    code: "INTERNAL_ERROR",
  })
}

function writeFailureLog(logger, req, route, error, apiError) {
  if (apiError.status < 500 || typeof logger?.error !== "function") return
  const cause = error instanceof BackendChatDbError && error.cause ? error.cause : error
  logger.error("Quality Agent API failure", {
    method: req.method ?? "GET",
    route: route?.join("/") ?? "unknown",
    apiCode: apiError.code,
    status: apiError.status,
    stage: error?.stage,
    operation: error?.operation,
    errorName: cause?.name,
    dbCode: cause?.code,
    errno: cause?.errno,
    sqlState: cause?.sqlState,
  })
}

function parseRoute(req) {
  let url
  try {
    url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
  } catch {
    throw new AgentApiRequestError("요청 URL이 올바르지 않습니다.", { status: 400, code: "INVALID_URL" })
  }
  if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) return null
  try {
    return url.pathname.slice(API_PREFIX.length).split("/").filter(Boolean).map(decodeURIComponent)
  } catch {
    throw new AgentApiRequestError("요청 URL이 올바르지 않습니다.", { status: 400, code: "INVALID_URL" })
  }
}

export function createAgentChatApi({
  historyRepository,
  chatService,
  repositoryFactory = createConversationHistoryRepository,
  chatServiceFactory = createBackendChatService,
  logger = console,
} = {}) {
  let repository = historyRepository
  let service = chatService
  let ownsRepository = false

  const getServices = () => {
    if (!repository) {
      try {
        repository = repositoryFactory()
      } catch (cause) {
        throw new BackendChatDbError("대화 DB Repository를 초기화하지 못했습니다.", {
          operation: "initialize_repository",
          cause,
        })
      }
      ownsRepository = true
    }
    if (!service) service = chatServiceFactory({ historyRepository: repository })
    return { repository, service }
  }

  return {
    async handle(req, res) {
      let route
      try {
        route = parseRoute(req)
        if (route === null) return false
        const userId = requireUserId(req)
        const { repository: activeRepository, service: activeService } = getServices()
        const method = req.method ?? "GET"

        if (route.length === 1 && route[0] === "conversations" && method === "GET") {
          const conversations = await activeRepository.listConversations(userId)
          sendJson(res, 200, { conversations })
          return true
        }

        if (route.length === 1 && route[0] === "conversations" && method === "POST") {
          const body = await readJsonBody(req)
          const conversation = await activeRepository.createConversation({ userId, title: body.title })
          sendJson(res, 201, { conversation })
          return true
        }

        const conversationId = route[0] === "conversations" ? route[1] : undefined
        if (conversationId && route.length === 3 && route[2] === "messages" && method === "GET") {
          const messages = await activeRepository.listMessages({ conversationId, userId })
          sendJson(res, 200, { conversationId, messages: messages.map(normalizeAgentMessage) })
          return true
        }

        if (conversationId && route.length === 3 && route[2] === "messages" && method === "POST") {
          const body = await readJsonBody(req)
          const result = await activeService.ask({ conversationId, userId, question: body.question })
          sendJson(res, 200, {
            ...result,
            userMessage: normalizeAgentMessage(result.userMessage),
            assistantMessage: normalizeAgentMessage(result.assistantMessage),
            ragSources: Array.isArray(result.ragSources) ? result.ragSources : [],
          })
          return true
        }

        if (conversationId && route.length === 2 && method === "DELETE") {
          const result = await activeRepository.deleteConversation({ conversationId, userId })
          sendJson(res, 200, result)
          return true
        }

        throw new AgentApiRequestError("지원하지 않는 품질 Agent API 요청입니다.", {
          status: 404,
          code: "API_NOT_FOUND",
        })
      } catch (error) {
        if (route === null) return false
        const apiError = toApiError(error)
        writeFailureLog(logger, req, route, error, apiError)
        sendJson(res, apiError.status, { error: { code: apiError.code, message: apiError.message } })
        return true
      }
    },

    async close() {
      if (ownsRepository && repository) await repository.close()
    },
  }
}
