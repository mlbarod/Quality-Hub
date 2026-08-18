import { createDashboardRepository } from "./dashboardRepository.mjs"

const API_PATH = "/api/dashboard"

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

function requireUserId(req) {
  const header = req.headers["x-quality-hub-user-id"]
  const userId = Array.isArray(header) ? header[0] : header
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.trim().length > 20) {
    throw new DashboardApiRequestError("사용자 식별 정보가 필요합니다.", {
      status: 401,
      code: "USER_ID_REQUIRED",
    })
  }
}

export class DashboardApiRequestError extends Error {
  constructor(message, { status = 400, code = "BAD_REQUEST" } = {}) {
    super(message)
    this.name = "DashboardApiRequestError"
    this.status = status
    this.code = code
  }
}

function toApiError(error) {
  if (error instanceof DashboardApiRequestError) return error
  if (error && typeof error === "object" && ("sqlState" in error || "errno" in error || "fatal" in error)) {
    return new DashboardApiRequestError("대시보드 DB 요청을 처리하지 못했습니다.", {
      status: 503,
      code: "DB_FAILED",
    })
  }
  return new DashboardApiRequestError("대시보드 요청을 처리하지 못했습니다.", {
    status: 500,
    code: "INTERNAL_ERROR",
  })
}

export function createDashboardApi({
  repository,
  repositoryFactory = createDashboardRepository,
  logger = console,
} = {}) {
  let activeRepository = repository
  let ownsRepository = false

  const getRepository = () => {
    if (!activeRepository) {
      try {
        activeRepository = repositoryFactory()
      } catch {
        throw new DashboardApiRequestError("대시보드 DB 연결 설정을 확인해 주세요.", {
          status: 503,
          code: "DB_FAILED",
        })
      }
      ownsRepository = true
    }
    return activeRepository
  }

  return {
    async handle(req, res) {
      let url
      try {
        url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      } catch {
        return false
      }
      if (url.pathname !== API_PATH) return false

      try {
        requireUserId(req)
        const method = req.method ?? "GET"
        if (method === "GET") {
          const dashboard = await getRepository().getDashboard()
          sendJson(res, 200, { dashboard })
          return true
        }

        sendJson(res, 405, {
          error: { code: "METHOD_NOT_ALLOWED", message: "지원하지 않는 대시보드 API 요청입니다." },
        }, { Allow: "GET" })
        return true
      } catch (error) {
        const apiError = toApiError(error)
        if (apiError.status >= 500 && typeof logger?.error === "function") {
          logger.error("Dashboard API failure", {
            method: req.method ?? "GET",
            path: API_PATH,
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
