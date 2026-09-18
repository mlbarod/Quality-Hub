import { createClickedHistoryRepository, validateClickedHistory } from "./clickedHistoryRepository.mjs"

function respond(res, status, code, headers = {}, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers })
  res.end(code ? JSON.stringify({ error: { code } }) : payload ? JSON.stringify(payload) : undefined)
}

export function createClickedHistoryApi({ repository, repositoryFactory = createClickedHistoryRepository, logger = console } = {}) {
  let activeRepository = repository
  let ownsRepository = false
  return {
    async handle(req, res) {
      if (new URL(req.url ?? "/", "http://localhost").pathname !== "/api/clicked-history") return false
      if (req.method !== "POST") {
        respond(res, 405, "METHOD_NOT_ALLOWED", { Allow: "POST" })
        return true
      }
      // SSO 활성화 시 서버가 검증한 세션을 우선하고, 비활성화 개발 모드에서만 기존 식별 헤더를 사용한다.
      const userId = req.auth?.userId ?? req.headers["x-quality-hub-user-id"]
      if (typeof userId !== "string" || !userId.trim() || [...userId.trim()].length > 20) {
        respond(res, 401, "USER_ID_REQUIRED")
        return true
      }
      let input
      try {
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk)
          if (size > 4096) {
            respond(res, 413, "BODY_TOO_LARGE")
            return true
          }
          chunks.push(Buffer.from(chunk))
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new TypeError()
        input = validateClickedHistory({ category: body.category, contents: body.contents, userId, entryDate: body.entryDate })
      } catch {
        respond(res, 400, "INVALID_INPUT")
        return true
      }
      try {
        if (!activeRepository) {
          activeRepository = repositoryFactory()
          ownsRepository = true
        }
        const result = await activeRepository.recordClick(input)
        if (result?.entryDate) respond(res, 201, null, {}, result)
        else respond(res, 204)
      } catch (error) {
        logger.error?.("클릭 이력 저장 실패", { code: error?.code ?? "DB_FAILED" })
        respond(res, 503, "CLICK_HISTORY_UNAVAILABLE")
      }
      return true
    },
    async close() { if (ownsRepository) await activeRepository?.close() },
  }
}
