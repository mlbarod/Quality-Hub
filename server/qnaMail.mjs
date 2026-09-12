import { escapeMailHtml, richHtmlToMailHtml } from "./qnaMailHtml.mjs"

const ENDPOINT = "https://openapi.samsung.net/mail/api/v2.0/mails/send"
const REQUIRED_ENV = ["KNOX_MAIL_USER_ID", "KNOX_MAIL_TOKEN", "KNOX_MAIL_SYSTEM_ID", "KNOX_MAIL_PORTAL_URL"]

function configError(field) {
  return Object.assign(new Error(`메일 환경변수 확인: ${field}`), { mailField: field })
}

function diagnostics(error) {
  const codes = new Set(["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "ER_ACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UND_ERR_CONNECT_TIMEOUT"])
  const code = error?.cause?.code ?? error?.code
  return {
    ...(codes.has(code) ? { errorCode: code } : {}),
    ...(error?.name === "TimeoutError" ? { errorCode: "TIMEOUT" } : {}),
    ...(REQUIRED_ENV.includes(error?.mailField) || error?.mailField === "KNOX_MAIL_TIMEOUT_MS" ? { field: error.mailField } : {}),
    ...(error?.mailReason === "invalid_knox_id" ? { reason: "invalid_knox_id" } : {}),
  }
}

function writeMailLog(logger, state, details = {}) {
  const level = ["configuration_failed", "preparation_failed", "failed", "retrying"].includes(state) ? "error"
    : ["disabled", "skipped_disabled", "skipped_no_recipients", "department_recipients_unresolved"].includes(state) ? "warn" : "info"
  const output = logger[level] ?? logger.info ?? logger.log ?? logger.error
  output?.call(logger, `Q&A mail ${JSON.stringify({ state, ...details })}`)
}

export function loadQnaMailConfig(env = process.env) {
  if (env.KNOX_MAIL_ENABLED !== "true") return null
  const required = (key) => {
    const value = env[key]?.trim()
    if (!value || /[\r\n]/.test(value)) throw configError(key)
    return value
  }
  const userId = required("KNOX_MAIL_USER_ID")
  const token = required("KNOX_MAIL_TOKEN")
  const systemId = required("KNOX_MAIL_SYSTEM_ID")
  let portalUrl
  try { portalUrl = new URL(required("KNOX_MAIL_PORTAL_URL")) } catch { throw configError("KNOX_MAIL_PORTAL_URL") }
  if (!["http:", "https:"].includes(portalUrl.protocol) || portalUrl.username || portalUrl.password) throw configError("KNOX_MAIL_PORTAL_URL")
  const timeoutMs = Number(env.KNOX_MAIL_TIMEOUT_MS || 5000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw configError("KNOX_MAIL_TIMEOUT_MS")
  return { userId, token, systemId, portalUrl: portalUrl.href, timeoutMs }
}

export function richHtmlToMailText(html) {
  return String(html ?? "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<img\b[^>]*>/gi, "[이미지: 게시글에서 확인]")
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<\/(?:td|th)>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (entity, value) => {
      const named = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }
      const key = value.toLowerCase()
      if (key in named) return named[key]
      const code = key.startsWith("#x") ? parseInt(key.slice(2), 16) : Number(key.slice(1))
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "�"
    })
    .replace(/\n{3,}/g, "\n\n").trim()
}

function emailAddress(id) {
  const value = String(id ?? "").trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(value)) throw Object.assign(new Error("Knox ID 형식 확인"), { mailReason: "invalid_knox_id" })
  return `${value}@samsung.com`
}

export function buildQnaMail(config, { eventType, question, message, actor, recipientUserIds }) {
  const link = new URL(config.portalUrl)
  link.search = ""
  link.hash = ""
  link.searchParams.set("qna", "open")
  link.searchParams.set("questionId", String(question.questionId))
  const reply = eventType === "message_created"
  const contents = [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#ffffff;">',
    '<div style="font-family:Arial,\'Malgun Gothic\',sans-serif;font-size:11pt;line-height:1.8;color:#263b4a;text-align:left;overflow-wrap:break-word;">',
    `<p style="margin:0 0 16px;">작성자: ${escapeMailHtml(actor.displayName)}<br>구분: ${escapeMailHtml(question.category)}<br>라인: ${escapeMailHtml(question.lineName)}</p>`,
    `<p style="margin:0 0 24px;">게시글 바로가기:<br><a href="${escapeMailHtml(link.href)}" target="_blank" rel="noopener noreferrer" style="color:#0673bc;text-decoration:underline;overflow-wrap:anywhere;">${escapeMailHtml(link.href)}</a></p>`,
    '<h2 style="margin:0 0 16px;font-size:18px;color:#172c3c;">질문 본문</h2>',
    `<div>${richHtmlToMailHtml(question.bodyHtml, config.portalUrl)}</div>`,
  ]
  if (reply) contents.push(
    '<hr style="margin:32px 0 24px;border:0;border-top:3px solid #6c91aa;">',
    '<h2 style="margin:0 0 16px;font-size:18px;color:#172c3c;">추가 답변</h2>',
    `<div style="font-size:11pt;line-height:1.65;color:#454a4f;">${richHtmlToMailHtml(message.bodyHtml, config.portalUrl)}</div>`,
  )
  contents.push("</div></body></html>")
  return {
    subject: `${reply ? "[품질 Hub VOE] 추가 답변: " : "[품질 Hub VOE] 게시글 등록:"}${question.title}`,
    docSecuType: "PERSONAL", contents: contents.join("\n"), contentType: "HTML",
    sender: { emailAddress: emailAddress(actor.userId) },
    recipients: [...new Set(recipientUserIds.map(emailAddress))].map((address) => ({ emailAddress: address, recipientType: "TO" })),
  }
}

export function createQnaMailNotifier({ env = process.env, fetchImpl = globalThis.fetch, logger = console } = {}) {
  return {
    reportStartup() {
      const missingFields = REQUIRED_ENV.filter((key) => !env[key]?.trim())
      try {
        const config = loadQnaMailConfig(env)
        if (!config) {
          writeMailLog(logger, "disabled", { stage: "startup", reason: env.KNOX_MAIL_ENABLED === undefined ? "enabled_not_set" : "enabled_not_true", missingFields })
        } else {
          writeMailLog(logger, "configured", { stage: "startup", timeoutMs: config.timeoutMs, maxAttempts: 2 })
        }
      } catch (error) {
        writeMailLog(logger, "configuration_failed", { stage: "startup", missingFields, ...diagnostics(error) })
      }
    },
    async notify({ repository, eventType, questionId, messageId, actor }) {
      const context = { eventType, questionId, ...(messageId ? { messageId } : {}) }
      // 토큰, 주소, 본문과 원격 오류 응답은 로그에 남기지 않는다.
      const log = (state, details = {}) => writeMailLog(logger, state, { ...context, ...details })
      let config, payload
      let stage = "configuration"
      try {
        config = loadQnaMailConfig(env)
        if (!config) { log("skipped_disabled", { field: "KNOX_MAIL_ENABLED" }); return }
        stage = "recipient_and_content_query"
        const data = await repository.getMailContext(questionId, messageId)
        if (!data) { log("skipped_hidden_or_missing"); return }
        if (data.departmentRuleCount) log("department_recipients_unresolved", { ruleCount: data.departmentRuleCount })
        stage = "message_composition"
        payload = buildQnaMail(config, { ...data, eventType, actor })
        if (!payload.recipients.length) { log("skipped_no_recipients"); return }
      } catch (error) {
        log("preparation_failed", { stage, ...diagnostics(error) })
        return
      }
      const url = new URL(ENDPOINT)
      url.searchParams.set("userId", config.userId)
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const response = await fetchImpl(url, {
            method: "POST", redirect: "error", signal: AbortSignal.timeout(config.timeoutMs),
            headers: { accept: "*/*", "Content-Type": "application/json", Authorization: `Bearer ${config.token}`, "System-ID": config.systemId },
            body: JSON.stringify(payload),
          })
          await response.body?.cancel()
          // 실제 응답 계약 미수령: HTTP 접수와 실제 전달 성공을 구분한다.
          if (response.ok) { log("http_accepted_response_unverified", { attempt, httpStatus: response.status }); return }
          log(attempt === 2 ? "failed" : "retrying", { attempt, httpStatus: response.status })
        } catch (error) {
          log(attempt === 2 ? "failed" : "retrying", { attempt, reason: "network_or_timeout", ...diagnostics(error) })
        }
      }
    },
  }
}
