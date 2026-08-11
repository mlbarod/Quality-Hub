import assert from "node:assert/strict"
import test from "node:test"

import {
  APIConnectionTimeoutError,
  APIError,
} from "openai"

import {
  createGptOssChatCompletion,
  createGptOssRequestHeaders,
  GPT_OSS_MODEL,
  GPT_OSS_TEMPERATURE,
  GptOssApiError,
  GptOssResponseError,
  GptOssTimeoutError,
  loadGptOssConfig,
} from "../server/gptOssClient.mjs"
import { generateGptOssReply } from "../server/gptOssService.mjs"

const config = {
  apiUrl: "https://gpt-oss.example.internal/v1",
  credentialKey: "credential:TICKET-example==",
  systemName: "quality-hub-playground",
  userId: "quality.kim",
  timeoutMs: 120_000,
}

function createOpenAIMock({ completion, error } = {}) {
  const calls = { clients: [], requests: [] }
  class OpenAIImpl {
    constructor(options) {
      calls.clients.push(options)
      this.chat = {
        completions: {
          create: async (request) => {
            calls.requests.push(request)
            if (error) throw error
            return completion
          },
        },
      }
    }
  }
  return { OpenAIImpl, calls }
}

function createCompletion(content = "I am fine.") {
  return {
    id: "chatcmpl-example",
    model: GPT_OSS_MODEL,
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

test("GPT-OSS Backend 환경변수와 기본 timeout을 읽고 누락·잘못된 값을 거부한다", () => {
  const environment = {
    GPT_OSS_API_URL: config.apiUrl,
    GPT_OSS_CREDENTIAL_KEY: config.credentialKey,
    GPT_OSS_SYSTEM_NAME: config.systemName,
    GPT_OSS_USER_ID: config.userId,
  }

  assert.deepEqual(loadGptOssConfig(environment), config)
  assert.throws(() => loadGptOssConfig({}), /GPT_OSS_API_URL, GPT_OSS_CREDENTIAL_KEY, GPT_OSS_SYSTEM_NAME, GPT_OSS_USER_ID/)
  assert.throws(() => loadGptOssConfig({ ...environment, GPT_OSS_TIMEOUT_MS: "0" }), /1 이상의 정수/)
})

test("공식 Header 구조와 요청별 Prompt/Completion UUID를 생성한다", () => {
  const ids = ["prompt-uuid", "completion-uuid"]
  const result = createGptOssRequestHeaders(config, () => ids.shift())

  assert.deepEqual(result, {
    headers: {
      "x-dep-ticket": "credential:TICKET-example==",
      "Send-System-Name": "quality-hub-playground",
      "User-Id": "quality.kim",
      "User-Type": "AD_ID",
      "Prompt-Msg-Id": "prompt-uuid",
      "Completion-Msg-Id": "completion-uuid",
    },
    promptMessageId: "prompt-uuid",
    completionMessageId: "completion-uuid",
  })
})

test("OpenAI SDK Client와 Chat Completions 요청이 공식 계약을 유지한다", async () => {
  const mock = createOpenAIMock({ completion: createCompletion() })
  const ids = ["prompt-uuid", "completion-uuid"]
  const result = await createGptOssChatCompletion({
    systemMessage: "You are a helpful assistant.",
    userMessage: "How are you?",
  }, {
    config,
    uuidFactory: () => ids.shift(),
    OpenAIImpl: mock.OpenAIImpl,
  })

  assert.deepEqual(mock.calls.clients, [{
    apiKey: "dummy",
    baseURL: "https://gpt-oss.example.internal/v1",
    defaultHeaders: {
      "x-dep-ticket": "credential:TICKET-example==",
      "Send-System-Name": "quality-hub-playground",
      "User-Id": "quality.kim",
      "User-Type": "AD_ID",
      "Prompt-Msg-Id": "prompt-uuid",
      "Completion-Msg-Id": "completion-uuid",
    },
    timeout: 120_000,
  }])
  assert.deepEqual(mock.calls.requests, [{
    model: "gpt-oss-120b",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "How are you?" },
    ],
    temperature: GPT_OSS_TEMPERATURE,
  }])
  assert.equal("reasoning_effort" in mock.calls.requests[0], false)
  assert.equal(result.promptMessageId, "prompt-uuid")
  assert.equal(result.completionMessageId, "completion-uuid")
})

test("Backend 통합 호출은 History의 user/assistant role을 그대로 전달한다", async () => {
  const mock = createOpenAIMock({ completion: createCompletion() })
  const messages = [
    { role: "system", content: "system" },
    { role: "user", content: "이전 질문" },
    { role: "assistant", content: "이전 답변" },
    { role: "user", content: "RAG Context와 현재 질문" },
  ]

  await createGptOssChatCompletion({ messages }, { config, OpenAIImpl: mock.OpenAIImpl })

  assert.deepEqual(mock.calls.requests[0], {
    model: "gpt-oss-120b",
    messages,
    temperature: GPT_OSS_TEMPERATURE,
  })
  await assert.rejects(
    createGptOssChatCompletion({ messages: [{ role: "tool", content: "잘못된 role" }] }, { config, OpenAIImpl: mock.OpenAIImpl }),
    /role은 system, user 또는 assistant/,
  )
})

test("각 Chat Completion 호출마다 새로운 UUID Header를 만든다", async () => {
  const mock = createOpenAIMock({ completion: createCompletion() })
  const ids = ["prompt-1", "completion-1", "prompt-2", "completion-2"]
  const options = { config, uuidFactory: () => ids.shift(), OpenAIImpl: mock.OpenAIImpl }

  await createGptOssChatCompletion({ systemMessage: "system", userMessage: "first" }, options)
  await createGptOssChatCompletion({ systemMessage: "system", userMessage: "second" }, options)

  assert.equal(mock.calls.clients[0].defaultHeaders["Prompt-Msg-Id"], "prompt-1")
  assert.equal(mock.calls.clients[1].defaultHeaders["Prompt-Msg-Id"], "prompt-2")
  assert.equal(mock.calls.clients[0].defaultHeaders["Completion-Msg-Id"], "completion-1")
  assert.equal(mock.calls.clients[1].defaultHeaders["Completion-Msg-Id"], "completion-2")
})

test("Service는 choices[0].message.content와 확인 메타데이터를 반환한다", async () => {
  const mock = createOpenAIMock({ completion: createCompletion("정상 답변") })
  const ids = ["prompt-uuid", "completion-uuid"]
  const result = await generateGptOssReply({ systemMessage: "system", userMessage: "user" }, {
    config,
    uuidFactory: () => ids.shift(),
    OpenAIImpl: mock.OpenAIImpl,
  })

  assert.deepEqual(result, {
    content: "정상 답변",
    completionId: "chatcmpl-example",
    model: "gpt-oss-120b",
    finishReason: "stop",
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    promptMessageId: "prompt-uuid",
    completionMessageId: "completion-uuid",
  })
})

test("timeout, API 오류와 응답 구조 오류를 구분한다", async () => {
  const timeoutMock = createOpenAIMock({ error: new APIConnectionTimeoutError() })
  await assert.rejects(
    createGptOssChatCompletion({ systemMessage: "system", userMessage: "user" }, { config, OpenAIImpl: timeoutMock.OpenAIImpl }),
    (error) => error instanceof GptOssTimeoutError && error.timeoutMs === 120_000,
  )

  const apiError = new APIError(401, { code: "unauthorized", type: "authentication_error" }, "Unauthorized", new Headers({ "x-request-id": "req-1" }))
  const apiMock = createOpenAIMock({ error: apiError })
  await assert.rejects(
    createGptOssChatCompletion({ systemMessage: "system", userMessage: "user" }, { config, OpenAIImpl: apiMock.OpenAIImpl }),
    (error) => error instanceof GptOssApiError
      && error.status === 401
      && error.code === "unauthorized"
      && error.requestId === "req-1",
  )

  const responseMock = createOpenAIMock({ completion: { id: "empty", choices: [] } })
  await assert.rejects(
    generateGptOssReply({ systemMessage: "system", userMessage: "user" }, { config, OpenAIImpl: responseMock.OpenAIImpl }),
    GptOssResponseError,
  )
})
