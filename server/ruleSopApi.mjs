import { randomUUID } from "node:crypto"

import { createRuleSopRepository, RuleSopNotFoundError } from "./ruleSopRepository.mjs"

const API_PATH = "/api/rules"
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

export class RuleSopApiRequestError extends Error {
  constructor(message, { status = 400, code = "BAD_REQUEST" } = {}) {
    super(message)
    this.name = "RuleSopApiRequestError"
    this.status = status
    this.code = code
  }
}

function requireUserId(req) {
  const header = req.headers["x-quality-hub-user-id"]
  const userId = Array.isArray(header) ? header[0] : header
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.trim().length > 50) {
    throw new RuleSopApiRequestError("사용자 식별 정보가 필요합니다.", {
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
      throw new RuleSopApiRequestError("요청 내용이 너무 큽니다.", {
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
    throw new RuleSopApiRequestError("JSON 요청 형식이 올바르지 않습니다.", {
      status: 400,
      code: "INVALID_JSON",
    })
  }
}

function getRuleSopRoute(req) {
  let url
  try {
    url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
  } catch {
    return null
  }
  if (url.pathname === API_PATH) return { documentId: null }
  if (!url.pathname.startsWith(`${API_PATH}/`)) return null
  const encodedDocumentId = url.pathname.slice(API_PATH.length + 1)
  if (!encodedDocumentId || encodedDocumentId.includes("/")) return null
  try {
    return { documentId: decodeURIComponent(encodedDocumentId) }
  } catch {
    return null
  }
}

function publicDocument(document, documentId) {
  return {
    documentId,
    mainCategory: document.mainCategory,
    subCategory: document.subCategory,
    item: document.item,
    title: document.title,
    url: document.url,
  }
}

function toApiError(error) {
  if (error instanceof RuleSopApiRequestError) return error
  if (error instanceof RuleSopNotFoundError) {
    return new RuleSopApiRequestError(error.message, { status: 404, code: "RULE_SOP_NOT_FOUND" })
  }
  if (error instanceof TypeError) {
    return new RuleSopApiRequestError(error.message, { status: 400, code: "INVALID_INPUT" })
  }
  if (error && typeof error === "object" && ("sqlState" in error || "errno" in error || "fatal" in error)) {
    return new RuleSopApiRequestError("Rule&SOP DB 요청을 처리하지 못했습니다.", {
      status: 503,
      code: "DB_FAILED",
    })
  }
  return new RuleSopApiRequestError("Rule&SOP 요청을 처리하지 못했습니다.", {
    status: 500,
    code: "INTERNAL_ERROR",
  })
}

export function createRuleSopApi({
  repository,
  repositoryFactory = createRuleSopRepository,
  logger = console,
  uuidFactory = randomUUID,
} = {}) {
  let activeRepository = repository
  let ownsRepository = false
  const documentReferences = new Map()
  const maxDocumentReferences = 5000

  const rememberDocument = (document, userId) => {
    const documentId = uuidFactory()
    documentReferences.set(documentId, { document, userId })
    if (documentReferences.size > maxDocumentReferences) {
      documentReferences.delete(documentReferences.keys().next().value)
    }
    return publicDocument(document, documentId)
  }

  const requireDocumentReference = (documentId, userId) => {
    const entry = documentId ? documentReferences.get(documentId) : undefined
    if (!entry || entry.userId !== userId) throw new RuleSopNotFoundError()
    return entry.document
  }

  const getRepository = () => {
    if (!activeRepository) {
      try {
        activeRepository = repositoryFactory()
      } catch {
        throw new RuleSopApiRequestError("Rule&SOP DB 연결 설정을 확인해 주세요.", {
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
      const route = getRuleSopRoute(req)
      if (!route) return false

      try {
        const userId = requireUserId(req)
        const method = req.method ?? "GET"

        if (method === "GET" && route.documentId === null) {
          const documents = await getRepository().listDocuments()
          sendJson(res, 200, { documents: documents.map((document) => rememberDocument(document, userId)) })
          return true
        }

        if (method === "POST" && route.documentId === null) {
          const body = await readJsonBody(req)
          const document = await getRepository().createDocument({ ...body, userId })
          sendJson(res, 201, { document })
          return true
        }

        if (method === "PATCH" && route.documentId !== null) {
          const reference = requireDocumentReference(route.documentId, userId)
          const body = await readJsonBody(req)
          const document = await getRepository().updateDocument(reference, body)
          documentReferences.delete(route.documentId)
          sendJson(res, 200, { document })
          return true
        }

        if (method === "DELETE" && route.documentId !== null) {
          const reference = requireDocumentReference(route.documentId, userId)
          const result = await getRepository().deleteDocument(reference)
          documentReferences.delete(route.documentId)
          sendJson(res, 200, result)
          return true
        }

        sendJson(res, 405, {
          error: { code: "METHOD_NOT_ALLOWED", message: "지원하지 않는 Rule&SOP API 요청입니다." },
        }, { Allow: route.documentId === null ? "GET, POST" : "PATCH, DELETE" })
        return true
      } catch (error) {
        const apiError = toApiError(error)
        if (apiError.status >= 500 && typeof logger?.error === "function") {
          logger.error("Rule&SOP API failure", {
            method: req.method ?? "GET",
            path: route.documentId === null ? API_PATH : `${API_PATH}/:documentId`,
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
