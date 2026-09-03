import OpenAI, { APIConnectionTimeoutError, APIError } from "openai"

export const GPT_OSS_MODEL = "gpt-oss-120b"
export const GPT_OSS_TEMPERATURE = 0.5
export const DEFAULT_OPENWEBUI_TIMEOUT_SECONDS = 120
export const DEFAULT_OPENWEBUI_SUMMARY_BATCH_SIZE = 10
const REQUIRED_CONFIG = [
  "OPENWEBUI_URL",
  "OPENWEBUI_MODEL",
  "OPENWEBUI_API_TOKEN",
]

export class GptOssTimeoutError extends Error {
  constructor(message, { timeoutMs, cause } = {}) {
    super(message)
    this.name = "GptOssTimeoutError"
    this.timeoutMs = timeoutMs
    this.cause = cause
  }
}

export class GptOssApiError extends Error {
  constructor(message, { status, code, type, requestId, cause } = {}) {
    super(message)
    this.name = "GptOssApiError"
    this.status = status
    this.code = code
    this.type = type
    this.requestId = requestId
    this.cause = cause
  }
}

export class GptOssResponseError extends Error {
  constructor(message, { completion, cause } = {}) {
    super(message)
    this.name = "GptOssResponseError"
    this.completion = completion
    this.cause = cause
  }
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldName} 값을 입력해 주세요.`)
  }
  return value
}

function normalizeChatMessages({ messages, systemMessage, userMessage }) {
  if (messages === undefined) {
    return [
      { role: "system", content: requireText(systemMessage, "system message") },
      { role: "user", content: requireText(userMessage, "user message") },
    ]
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new TypeError("messages는 1개 이상의 메시지를 포함해야 합니다.")
  }

  return messages.map((message, index) => {
    if (!message || !["system", "user", "assistant"].includes(message.role)) {
      throw new TypeError(`messages[${index}].role은 system, user 또는 assistant여야 합니다.`)
    }
    return {
      role: message.role,
      content: requireText(message.content, `messages[${index}].content`),
    }
  })
}

function parsePositiveInteger(value, { defaultValue, fieldName }) {
  if (value === undefined || value === "") return defaultValue
  if (!/^\d+$/.test(value)) throw new TypeError(`${fieldName}는 1 이상의 정수여야 합니다.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypeError(`${fieldName}는 1 이상의 정수여야 합니다.`)
  }
  return parsed
}

function parseCommonHeaders(value) {
  if (value === undefined || value.trim() === "") return {}

  let headers
  try {
    headers = JSON.parse(value)
  } catch {
    throw new TypeError("OPENWEBUI_COMMON_HEADERS는 JSON 객체여야 합니다.")
  }
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    throw new TypeError("OPENWEBUI_COMMON_HEADERS는 JSON 객체여야 합니다.")
  }
  for (const [name, headerValue] of Object.entries(headers)) {
    if (name.trim().length === 0 || typeof headerValue !== "string") {
      throw new TypeError("OPENWEBUI_COMMON_HEADERS의 헤더 이름과 값은 문자열이어야 합니다.")
    }
  }
  return headers
}

export function normalizeOpenWebUiApiUrl(value) {
  const input = requireText(value, "OPENWEBUI_URL").trim()
  let url
  try {
    url = new URL(input)
  } catch {
    throw new TypeError("OPENWEBUI_URL은 유효한 HTTP(S) URL이어야 합니다.")
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new TypeError("OPENWEBUI_URL은 인증정보, query, hash가 없는 HTTP(S) URL이어야 합니다.")
  }

  const pathname = url.pathname.replace(/\/+$/, "")
  if (pathname.endsWith("/api/chat/completions")) {
    url.pathname = pathname.slice(0, -"/chat/completions".length)
  } else if (pathname.endsWith("/api")) {
    url.pathname = pathname
  } else {
    url.pathname = `${pathname}/api`
  }
  return url.toString().replace(/\/$/, "")
}

export function loadGptOssConfig(environment = process.env) {
  const missing = REQUIRED_CONFIG.filter((name) => typeof environment[name] !== "string" || environment[name].trim().length === 0)
  if (missing.length > 0) {
    throw new Error(`OpenWebUI API 환경변수가 필요합니다: ${missing.join(", ")}`)
  }

  const timeoutSeconds = parsePositiveInteger(environment.OPENWEBUI_TIMEOUT_SECONDS, {
    defaultValue: DEFAULT_OPENWEBUI_TIMEOUT_SECONDS,
    fieldName: "OPENWEBUI_TIMEOUT_SECONDS",
  })
  const timeoutMs = timeoutSeconds * 1_000
  if (!Number.isSafeInteger(timeoutMs)) {
    throw new TypeError("OPENWEBUI_TIMEOUT_SECONDS가 너무 큽니다.")
  }
  return {
    apiUrl: normalizeOpenWebUiApiUrl(environment.OPENWEBUI_URL),
    model: requireText(environment.OPENWEBUI_MODEL, "OPENWEBUI_MODEL").trim(),
    apiToken: requireText(environment.OPENWEBUI_API_TOKEN, "OPENWEBUI_API_TOKEN").trim(),
    commonHeaders: parseCommonHeaders(environment.OPENWEBUI_COMMON_HEADERS),
    timeoutSeconds,
    timeoutMs,
    summaryBatchSize: parsePositiveInteger(environment.OPENWEBUI_SUMMARY_BATCH_SIZE, {
      defaultValue: DEFAULT_OPENWEBUI_SUMMARY_BATCH_SIZE,
      fieldName: "OPENWEBUI_SUMMARY_BATCH_SIZE",
    }),
  }
}

export async function createGptOssChatCompletion(input, {
  config = loadGptOssConfig(),
  OpenAIImpl = OpenAI,
} = {}) {
  const messages = normalizeChatMessages(input ?? {})
  const client = new OpenAIImpl({
    apiKey: config.apiToken,
    baseURL: config.apiUrl,
    defaultHeaders: config.commonHeaders,
    timeout: config.timeoutMs,
  })

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      messages,
      temperature: GPT_OSS_TEMPERATURE,
    })

    return { completion }
  } catch (error) {
    if (error instanceof APIConnectionTimeoutError) {
      throw new GptOssTimeoutError(`OpenWebUI API 호출이 ${config.timeoutSeconds}초 안에 완료되지 않았습니다.`, {
        timeoutMs: config.timeoutMs,
        cause: error,
      })
    }
    if (error instanceof APIError) {
      throw new GptOssApiError(`OpenWebUI API 호출에 실패했습니다.${error.status ? ` HTTP ${error.status}` : ""}`, {
        status: error.status,
        code: error.code,
        type: error.type,
        requestId: error.requestID,
        cause: error,
      })
    }
    if (error instanceof SyntaxError) {
      throw new GptOssResponseError("OpenWebUI API 응답을 JSON으로 해석할 수 없습니다.", { cause: error })
    }
    throw error
  }
}
