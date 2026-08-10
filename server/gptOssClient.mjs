import { randomUUID } from "node:crypto"

import OpenAI, { APIConnectionTimeoutError, APIError } from "openai"

export const GPT_OSS_MODEL = "gpt-oss-120b"
export const GPT_OSS_TEMPERATURE = 0.5
export const DEFAULT_GPT_OSS_TIMEOUT_MS = 120_000
const DUMMY_OPENAI_API_KEY = "dummy"
const REQUIRED_CONFIG = [
  "GPT_OSS_API_URL",
  "GPT_OSS_CREDENTIAL_KEY",
  "GPT_OSS_SYSTEM_NAME",
  "GPT_OSS_USER_ID",
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

function parseTimeout(value) {
  if (value === undefined || value === "") return DEFAULT_GPT_OSS_TIMEOUT_MS
  if (!/^\d+$/.test(value)) throw new TypeError("GPT_OSS_TIMEOUT_MS는 1 이상의 정수여야 합니다.")
  const timeoutMs = Number(value)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("GPT_OSS_TIMEOUT_MS는 1 이상의 정수여야 합니다.")
  }
  return timeoutMs
}

export function loadGptOssConfig(environment = process.env) {
  const missing = REQUIRED_CONFIG.filter((name) => typeof environment[name] !== "string" || environment[name].length === 0)
  if (missing.length > 0) {
    throw new Error(`GPT-OSS API 환경변수가 필요합니다: ${missing.join(", ")}`)
  }

  return {
    apiUrl: environment.GPT_OSS_API_URL,
    credentialKey: environment.GPT_OSS_CREDENTIAL_KEY,
    systemName: environment.GPT_OSS_SYSTEM_NAME,
    userId: environment.GPT_OSS_USER_ID,
    timeoutMs: parseTimeout(environment.GPT_OSS_TIMEOUT_MS),
  }
}

export function createGptOssRequestHeaders(config, uuidFactory = randomUUID) {
  const promptMessageId = uuidFactory()
  const completionMessageId = uuidFactory()

  return {
    headers: {
      "x-dep-ticket": config.credentialKey,
      "Send-System-Name": config.systemName,
      "User-Id": config.userId,
      "User-Type": "AD_ID",
      "Prompt-Msg-Id": promptMessageId,
      "Completion-Msg-Id": completionMessageId,
    },
    promptMessageId,
    completionMessageId,
  }
}

export async function createGptOssChatCompletion({ systemMessage, userMessage }, {
  config = loadGptOssConfig(),
  uuidFactory = randomUUID,
  OpenAIImpl = OpenAI,
} = {}) {
  requireText(systemMessage, "system message")
  requireText(userMessage, "user message")

  const requestHeaders = createGptOssRequestHeaders(config, uuidFactory)
  const client = new OpenAIImpl({
    apiKey: DUMMY_OPENAI_API_KEY,
    baseURL: config.apiUrl,
    defaultHeaders: requestHeaders.headers,
    timeout: config.timeoutMs,
  })

  try {
    const completion = await client.chat.completions.create({
      model: GPT_OSS_MODEL,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      temperature: GPT_OSS_TEMPERATURE,
    })

    return {
      completion,
      promptMessageId: requestHeaders.promptMessageId,
      completionMessageId: requestHeaders.completionMessageId,
    }
  } catch (error) {
    if (error instanceof APIConnectionTimeoutError) {
      throw new GptOssTimeoutError(`GPT-OSS API 호출이 ${config.timeoutMs}ms 안에 완료되지 않았습니다.`, {
        timeoutMs: config.timeoutMs,
        cause: error,
      })
    }
    if (error instanceof APIError) {
      throw new GptOssApiError(`GPT-OSS API 호출에 실패했습니다.${error.status ? ` HTTP ${error.status}` : ""}`, {
        status: error.status,
        code: error.code,
        type: error.type,
        requestId: error.requestID,
        cause: error,
      })
    }
    if (error instanceof SyntaxError) {
      throw new GptOssResponseError("GPT-OSS API 응답을 JSON으로 해석할 수 없습니다.", { cause: error })
    }
    throw error
  }
}
