import assert from "node:assert/strict"
import test from "node:test"

import OpenAI, {
  APIConnectionTimeoutError,
  APIError,
} from "openai"

import {
  createGptOssChatCompletion,
  GPT_OSS_MODEL,
  GPT_OSS_TEMPERATURE,
  GptOssApiError,
  GptOssResponseError,
  GptOssTimeoutError,
  loadGptOssConfig,
  normalizeOpenWebUiApiUrl,
} from "../server/gptOssClient.mjs"
import { generateGptOssReply } from "../server/gptOssService.mjs"

const config = {
  apiUrl: "https://openwebui.example.internal/api",
  model: "gpt-oss-120b",
  apiToken: "sk-openwebui-example",
  commonHeaders: { "X-Quality-Hub": "agent" },
  timeoutSeconds: 120,
  timeoutMs: 120_000,
  summaryBatchSize: 10,
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

test("OpenWebUI 환경변수와 기본 설정을 읽고 URL을 공식 API base URL로 정규화한다", () => {
  const environment = {
    OPENWEBUI_URL: "https://openwebui.example.internal/",
    OPENWEBUI_MODEL: config.model,
    OPENWEBUI_API_TOKEN: config.apiToken,
    OPENWEBUI_COMMON_HEADERS: '{"X-Quality-Hub":"agent"}',
  }

  assert.deepEqual(loadGptOssConfig(environment), config)
  assert.equal(normalizeOpenWebUiApiUrl("https://openwebui.example.internal/api"), config.apiUrl)
  assert.equal(normalizeOpenWebUiApiUrl("https://openwebui.example.internal/api/chat/completions"), config.apiUrl)
  assert.throws(() => loadGptOssConfig({}), /OPENWEBUI_URL, OPENWEBUI_MODEL, OPENWEBUI_API_TOKEN/)
  assert.throws(() => loadGptOssConfig({ ...environment, OPENWEBUI_TIMEOUT_SECONDS: "0" }), /1 이상의 정수/)
  assert.throws(() => loadGptOssConfig({ ...environment, OPENWEBUI_SUMMARY_BATCH_SIZE: "no" }), /1 이상의 정수/)
  assert.throws(() => loadGptOssConfig({ ...environment, OPENWEBUI_COMMON_HEADERS: "[]" }), /JSON 객체/)
  assert.throws(() => loadGptOssConfig({ ...environment, OPENWEBUI_COMMON_HEADERS: '{"X-Test":1}' }), /문자열/)
  assert.throws(() => normalizeOpenWebUiApiUrl("file:///tmp/openwebui"), /HTTP\(S\)/)
})

test("OpenAI 호환 Client로 Bearer token, 공통 Header와 Chat Completions 요청을 전달한다", async () => {
  const mock = createOpenAIMock({ completion: createCompletion() })
  const result = await createGptOssChatCompletion({
    systemMessage: "You are a helpful assistant.",
    userMessage: "How are you?",
  }, {
    config,
    OpenAIImpl: mock.OpenAIImpl,
  })

  assert.deepEqual(mock.calls.clients, [{
    apiKey: "sk-openwebui-example",
    baseURL: "https://openwebui.example.internal/api",
    defaultHeaders: { "X-Quality-Hub": "agent" },
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
  assert.equal("summary_batch_size" in mock.calls.requests[0], false)
  assert.equal("reasoning_effort" in mock.calls.requests[0], false)
  assert.deepEqual(result, { completion: createCompletion() })
})

test("OpenWebUI 공식 endpoint와 Bearer 인증으로 실제 HTTP 요청을 구성한다", async () => {
  let observedRequest
  class OpenWebUiTestClient extends OpenAI {
    constructor(options) {
      super({
        ...options,
        fetch: async (url, init) => {
          const headers = new Headers(init.headers)
          observedRequest = {
            url: String(url),
            authorization: headers.get("authorization"),
            commonHeader: headers.get("x-quality-hub"),
            body: JSON.parse(init.body),
          }
          return new Response(JSON.stringify(createCompletion("정상 답변")), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        },
      })
    }
  }

  await createGptOssChatCompletion({ systemMessage: "system", userMessage: "user" }, {
    config,
    OpenAIImpl: OpenWebUiTestClient,
  })

  assert.deepEqual(observedRequest, {
    url: "https://openwebui.example.internal/api/chat/completions",
    authorization: "Bearer sk-openwebui-example",
    commonHeader: "agent",
    body: {
      model: "gpt-oss-120b",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
      temperature: 0.5,
    },
  })
})

test("Backend 통합 호출은 History의 user/assistant role과 설정된 모델을 그대로 전달한다", async () => {
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

  const whitespaceMessages = [{ role: "user", content: "  원문 공백 유지  " }]
  await createGptOssChatCompletion({ messages: whitespaceMessages }, { config, OpenAIImpl: mock.OpenAIImpl })
  assert.deepEqual(mock.calls.requests[1].messages, whitespaceMessages)
})

test("Service는 choices[0].message.content와 확인 메타데이터를 반환한다", async () => {
  const mock = createOpenAIMock({ completion: createCompletion("정상 답변") })
  const result = await generateGptOssReply({ systemMessage: "system", userMessage: "user" }, {
    config,
    OpenAIImpl: mock.OpenAIImpl,
  })

  assert.deepEqual(result, {
    content: "정상 답변",
    completionId: "chatcmpl-example",
    model: "gpt-oss-120b",
    finishReason: "stop",
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
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
