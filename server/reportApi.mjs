import { randomUUID } from "node:crypto"

import { createReportRepository, ReportNotFoundError } from "./reportRepository.mjs"

const API_PATH = "/api/reports"
const MAX_JSON_BODY_BYTES = 16 * 1024

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
    throw new ReportApiRequestError("사용자 식별 정보가 필요합니다.", {
      status: 401,
      code: "USER_ID_REQUIRED",
    })
  }
  return userId.trim()
}

async function readJsonBody(req) {
  const chunks = []
  let byteLength = 0
  for await (const chunk of req) {
    byteLength += chunk.length
    if (byteLength > MAX_JSON_BODY_BYTES) {
      throw new ReportApiRequestError("요청 내용이 너무 큽니다.", {
        status: 413,
        code: "BODY_TOO_LARGE",
      })
    }
    chunks.push(chunk)
  }

  if (byteLength === 0) return {}
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError()
    return value
  } catch {
    throw new ReportApiRequestError("JSON 요청 형식이 올바르지 않습니다.", {
      status: 400,
      code: "INVALID_JSON",
    })
  }
}

export class ReportApiRequestError extends Error {
  constructor(message, { status = 400, code = "BAD_REQUEST" } = {}) {
    super(message)
    this.name = "ReportApiRequestError"
    this.status = status
    this.code = code
  }
}

function toApiError(error) {
  if (error instanceof ReportApiRequestError) return error
  if (error instanceof ReportNotFoundError) {
    return new ReportApiRequestError(error.message, { status: 404, code: "REPORT_NOT_FOUND" })
  }
  if (error instanceof TypeError) {
    return new ReportApiRequestError(error.message, { status: 400, code: "INVALID_INPUT" })
  }
  if (error && typeof error === "object" && ("sqlState" in error || "errno" in error || "fatal" in error)) {
    return new ReportApiRequestError("Report DB 요청을 처리하지 못했습니다.", {
      status: 503,
      code: "DB_FAILED",
    })
  }
  return new ReportApiRequestError("Report 요청을 처리하지 못했습니다.", {
    status: 500,
    code: "INTERNAL_ERROR",
  })
}

function getReportRoute(req) {
  let url
  try {
    url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
  } catch {
    return null
  }
  if (url.pathname === API_PATH) return { reportId: null }
  if (!url.pathname.startsWith(`${API_PATH}/`)) return null
  const encodedReportId = url.pathname.slice(API_PATH.length + 1)
  if (!encodedReportId || encodedReportId.includes("/")) return null
  try {
    return { reportId: decodeURIComponent(encodedReportId) }
  } catch {
    return null
  }
}

function publicReport(report, reportId) {
  return {
    reportId,
    category: report.category,
    reportName: report.reportName,
    description: report.description,
    reportUrl: report.reportUrl,
  }
}

export function createReportApi({
  repository,
  repositoryFactory = createReportRepository,
  logger = console,
  uuidFactory = randomUUID,
} = {}) {
  let activeRepository = repository
  let ownsRepository = false
  const reportReferences = new Map()
  const maxReportReferences = 5000

  const rememberReport = (report, userId) => {
    const reportId = uuidFactory()
    reportReferences.set(reportId, { report, userId })
    if (reportReferences.size > maxReportReferences) {
      reportReferences.delete(reportReferences.keys().next().value)
    }
    return publicReport(report, reportId)
  }

  const requireReportReference = (reportId, userId) => {
    const entry = reportId ? reportReferences.get(reportId) : undefined
    if (!entry || entry.userId !== userId) throw new ReportNotFoundError()
    return entry.report
  }

  const getRepository = () => {
    if (!activeRepository) {
      try {
        activeRepository = repositoryFactory()
      } catch {
        throw new ReportApiRequestError("Report DB 연결 설정을 확인해 주세요.", {
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
      const route = getReportRoute(req)
      if (!route) return false

      try {
        const userId = requireUserId(req)
        const method = req.method ?? "GET"

        if (method === "GET" && route.reportId === null) {
          const reports = await getRepository().listReports()
          sendJson(res, 200, { reports: reports.map((report) => rememberReport(report, userId)) })
          return true
        }

        if (method === "POST" && route.reportId === null) {
          const body = await readJsonBody(req)
          const report = await getRepository().createReport({ ...body, userId })
          sendJson(res, 201, { report })
          return true
        }

        if (method === "PATCH" && route.reportId !== null) {
          const reference = requireReportReference(route.reportId, userId)
          const body = await readJsonBody(req)
          const report = await getRepository().updateReport(reference, body)
          reportReferences.delete(route.reportId)
          sendJson(res, 200, { report })
          return true
        }

        if (method === "DELETE" && route.reportId !== null) {
          const reference = requireReportReference(route.reportId, userId)
          const result = await getRepository().deleteReport(reference)
          reportReferences.delete(route.reportId)
          sendJson(res, 200, result)
          return true
        }

        sendJson(res, 405, {
          error: { code: "METHOD_NOT_ALLOWED", message: "지원하지 않는 Report API 요청입니다." },
        }, { Allow: route.reportId === null ? "GET, POST" : "PATCH, DELETE" })
        return true
      } catch (error) {
        const apiError = toApiError(error)
        if (apiError.status >= 500 && typeof logger?.error === "function") {
          logger.error("Report API failure", {
            method: req.method ?? "GET",
            path: route.reportId === null ? API_PATH : `${API_PATH}/:reportId`,
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
