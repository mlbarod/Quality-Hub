import { CHANGE_CATEGORY_LIMITS, createChangeCategoryRepository } from "./changeCategoryRepository.mjs"

const API_PATH = "/api/rule-category"
const DOWNLOAD_PATH = `${API_PATH}/source`
const MAX_JSON_BODY_BYTES = 9 * 1024 * 1024

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

export class ChangeCategoryApiRequestError extends Error {
  constructor(message, { status = 400, code = "BAD_REQUEST" } = {}) {
    super(message)
    this.name = "ChangeCategoryApiRequestError"
    this.status = status
    this.code = code
  }
}

function requireUserId(req) {
  const header = req.headers["x-quality-hub-user-id"]
  const userId = Array.isArray(header) ? header[0] : header
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.trim().length > CHANGE_CATEGORY_LIMITS.maxUserIdLength) {
    throw new ChangeCategoryApiRequestError("사용자 식별 정보가 필요합니다.", { status: 401, code: "USER_ID_REQUIRED" })
  }
  return userId.trim()
}

async function readJsonBody(req) {
  const chunks = []
  let byteLength = 0
  for await (const chunk of req) {
    byteLength += chunk.length
    if (byteLength > MAX_JSON_BODY_BYTES) {
      throw new ChangeCategoryApiRequestError("요청 내용이 너무 큽니다.", { status: 413, code: "BODY_TOO_LARGE" })
    }
    chunks.push(chunk)
  }
  if (byteLength === 0) return {}
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError()
    return value
  } catch {
    throw new ChangeCategoryApiRequestError("JSON 요청 형식이 올바르지 않습니다.", { status: 400, code: "INVALID_JSON" })
  }
}

function routeOf(req) {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    if (url.pathname === API_PATH) return "category"
    if (url.pathname === DOWNLOAD_PATH) return "download"
  } catch {
    return null
  }
  return null
}

function safeDownloadName(value) {
  return String(value ?? "change-category.xlsx").replace(/[\r\n"\\/]/g, "_")
}

function asciiDownloadName(value) {
  const fallback = value.replace(/[^\x20-\x7e]/g, "_")
  return fallback || "change-category.xlsx"
}

function toApiError(error) {
  if (error instanceof ChangeCategoryApiRequestError) return error
  if (error instanceof SyntaxError) return new ChangeCategoryApiRequestError("저장된 Category 표 형식을 확인할 수 없습니다.", { status: 500, code: "INVALID_STORED_SHEET" })
  if (error instanceof TypeError) return new ChangeCategoryApiRequestError(error.message, { status: 400, code: "INVALID_INPUT" })
  if (error && typeof error === "object" && ("sqlState" in error || "errno" in error || "fatal" in error)) {
    return new ChangeCategoryApiRequestError("변승위 Category DB 요청을 처리하지 못했습니다.", { status: 503, code: "DB_FAILED" })
  }
  return new ChangeCategoryApiRequestError("변승위 Category 요청을 처리하지 못했습니다.", { status: 500, code: "INTERNAL_ERROR" })
}

export function createChangeCategoryApi({ repository, repositoryFactory = createChangeCategoryRepository, logger = console } = {}) {
  let activeRepository = repository
  let ownsRepository = false
  const getRepository = () => {
    if (!activeRepository) {
      try {
        activeRepository = repositoryFactory()
      } catch {
        throw new ChangeCategoryApiRequestError("변승위 Category DB 연결 설정을 확인해 주세요.", { status: 503, code: "DB_FAILED" })
      }
      ownsRepository = true
    }
    return activeRepository
  }

  return {
    async handle(req, res) {
      const route = routeOf(req)
      if (!route) return false
      try {
        const userId = requireUserId(req)
        const method = req.method ?? "GET"
        if (route === "category" && method === "GET") {
          sendJson(res, 200, { category: await getRepository().getCategory() })
          return true
        }
        if (route === "category" && method === "PUT") {
          const body = await readJsonBody(req)
          const category = await getRepository().replaceCategory({ ...body, userId })
          sendJson(res, 200, { category })
          return true
        }
        if (route === "download" && method === "GET") {
          const file = await getRepository().getSourceFile()
          if (!file?.data) throw new ChangeCategoryApiRequestError("등록된 원본 Excel 파일이 없습니다.", { status: 404, code: "SOURCE_FILE_NOT_FOUND" })
          const name = safeDownloadName(file.name)
          const fallbackName = asciiDownloadName(name)
          res.writeHead(200, {
            "Content-Type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Length": file.data.length,
            "Content-Disposition": `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          })
          res.end(file.data)
          return true
        }
        sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "지원하지 않는 변승위 Category API 요청입니다." } }, {
          Allow: route === "category" ? "GET, PUT" : "GET",
        })
        return true
      } catch (error) {
        const apiError = toApiError(error)
        if (apiError.status >= 500 && typeof logger?.error === "function") {
          logger.error("Change Category API failure", {
            method: req.method ?? "GET",
            route,
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
