const ENDPOINT = "https://openapi.samsung.net/mail/api/v2.0/mails/send"

export function loadQnaMailConfig(env = process.env) {
  if (env.KNOX_MAIL_ENABLED !== "true") return null
  const required = (key) => {
    const value = env[key]?.trim()
    if (!value || /[\r\n]/.test(value)) throw new Error(`메일 환경변수 확인: ${key}`)
    return value
  }
  const userId = required("KNOX_MAIL_USER_ID")
  const token = required("KNOX_MAIL_TOKEN")
  const systemId = required("KNOX_MAIL_SYSTEM_ID")
  const portalUrl = new URL(required("KNOX_MAIL_PORTAL_URL"))
  if (!["http:", "https:"].includes(portalUrl.protocol) || portalUrl.username || portalUrl.password) throw new Error("메일 포털 URL 확인")
  const timeoutMs = Number(env.KNOX_MAIL_TIMEOUT_MS || 5000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error("메일 제한 시간 확인")
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
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(value)) throw new Error("Knox ID 형식 확인")
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
    `작성자: ${actor.displayName}`, `구분: ${question.category}`, `라인: ${question.lineName}`,
    "", "게시글 바로가기:", link.href, "", "질문 본문:", richHtmlToMailText(question.bodyHtml),
  ]
  if (reply) contents.push("", "추가 답변:", richHtmlToMailText(message.bodyHtml))
  return {
    subject: `${reply ? "[품질 Hub VOE] 추가 답변: " : "[품질 Hub VOE] 게시글 등록:"}${question.title}`,
    docSecuType: "PERSONAL", contents: contents.join("\n"), contentType: "TEXT",
    sender: { emailAddress: emailAddress(actor.userId) },
    recipients: [...new Set(recipientUserIds.map(emailAddress))].map((address) => ({ emailAddress: address, recipientType: "TO" })),
  }
}

export function createQnaMailNotifier({ env = process.env, fetchImpl = globalThis.fetch, logger = console } = {}) {
  return {
    async notify({ repository, eventType, questionId, messageId, actor }) {
      const context = { eventType, questionId, ...(messageId ? { messageId } : {}) }
      // 토큰, 주소, 본문과 원격 오류 응답은 로그에 남기지 않는다.
      const log = (state, details = {}) => logger.info?.("Q&A mail", { ...context, state, ...details })
      let config, payload
      try {
        config = loadQnaMailConfig(env)
        if (!config) return
        const data = await repository.getMailContext(questionId, messageId)
        if (!data) { log("skipped_hidden_or_missing"); return }
        if (data.departmentRuleCount) log("department_recipients_unresolved", { ruleCount: data.departmentRuleCount })
        payload = buildQnaMail(config, { ...data, eventType, actor })
        if (!payload.recipients.length) { log("skipped_no_recipients"); return }
      } catch {
        log("preparation_failed")
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
        } catch {
          log(attempt === 2 ? "failed" : "retrying", { attempt, reason: "network_or_timeout" })
        }
      }
    },
  }
}
