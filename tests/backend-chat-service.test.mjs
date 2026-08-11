import assert from "node:assert/strict"
import test from "node:test"

import {
  BACKEND_CHAT_STATUS,
  BackendChatDbError,
  BackendChatGptOssError,
  BackendChatRagError,
  buildChatUserMessage,
  buildRagContext,
  createBackendChatService,
  RagHitsStructureError,
} from "../server/backendChatService.mjs"

const rawHits = [
  {
    _index: "quality-index",
    _id: "doc-1",
    _score: 1.25,
    _source: { doc_id: "DOC-1", title: "관리 기준", content: "기준 내용" },
  },
]

function createRepositoryMock({ history = [], failAt } = {}) {
  const calls = []
  return {
    calls,
    async saveMessage(input) {
      calls.push({ operation: `save:${input.role}`, input })
      if (failAt === `save:${input.role}`) throw new Error(`${input.role} DB 실패`)
      return {
        ...input,
        messageId: input.role === "user" ? "user-message-1" : "assistant-message-1",
      }
    },
    async listRecentMessages(input) {
      calls.push({ operation: "history", input })
      if (failAt === "history") throw new Error("History DB 실패")
      return history
    },
    async updateMessageStatus(input) {
      calls.push({ operation: `status:${input.status}`, input })
      if (failAt === `status:${input.status}`) throw new Error("상태 DB 실패")
      return { messageId: input.messageId, status: input.status }
    },
  }
}

function createReply(content = "통합 답변") {
  return {
    content,
    completionId: "completion-1",
    model: "gpt-oss-120b",
    finishReason: "stop",
    usage: { total_tokens: 30 },
    promptMessageId: "prompt-1",
    completionMessageId: "completion-message-1",
  }
}

test("hits.hits 원문만으로 RAG Context와 출처를 구성하고 0건도 정상 처리한다", () => {
  const withHits = buildRagContext({ hits: { total: { value: 1 }, hits: rawHits } })
  assert.equal(withHits.hits, rawHits)
  assert.match(withHits.context, /"_index": "quality-index"/)
  assert.match(withHits.context, /"content": "기준 내용"/)

  assert.deepEqual(buildRagContext({ hits: { total: { value: 0 }, hits: [] } }), {
    hits: [],
    context: "RAG 검색 결과가 없습니다.",
  })
  assert.throws(() => buildRagContext({ result: [] }), RagHitsStructureError)
})

test("최근 History, RAG Context와 현재 질문을 구분해 GPT 입력을 만든다", () => {
  const prompt = buildChatUserMessage({
    history: [
      { role: "user", content: "이전 질문" },
      { role: "assistant", content: "이전 답변" },
    ],
    ragContext: "문서 Context",
    question: "현재 질문",
  })
  assert.match(prompt, /\[최근 대화 History\]\nuser: 이전 질문\nassistant: 이전 답변/)
  assert.match(prompt, /\[RAG Context\]\n문서 Context/)
  assert.match(prompt, /\[현재 질문\]\n현재 질문$/)
})

test("DB 저장, RAG, 최근 History, GPT-OSS, 답변·출처 저장을 순서대로 통합한다", async () => {
  const operations = []
  const repository = createRepositoryMock({
    history: [
      { role: "user", content: "이전 질문" },
      { role: "assistant", content: "이전 답변" },
    ],
  })
  const originalSave = repository.saveMessage.bind(repository)
  repository.saveMessage = async (input) => {
    operations.push(`db:${input.role}`)
    return originalSave(input)
  }
  const originalHistory = repository.listRecentMessages.bind(repository)
  repository.listRecentMessages = async (input) => {
    operations.push("db:history")
    return originalHistory(input)
  }
  const originalStatus = repository.updateMessageStatus.bind(repository)
  repository.updateMessageStatus = async (input) => {
    operations.push(`db:status:${input.status}`)
    return originalStatus(input)
  }
  let gptInput
  const service = createBackendChatService({
    historyRepository: repository,
    historyLimit: 6,
    ragSearch: async (question) => {
      operations.push("rag")
      assert.equal(question, "현재 질문")
      return { data: { hits: { total: { value: 1 }, hits: rawHits } } }
    },
    gptReply: async (input) => {
      operations.push("gpt-oss")
      gptInput = input
      return createReply()
    },
  })

  const result = await service.ask({
    conversationId: "conversation-1",
    userId: "quality.kim",
    question: "현재 질문",
  })

  assert.deepEqual(operations, [
    "db:user",
    "rag",
    "db:history",
    "gpt-oss",
    "db:assistant",
    "db:status:completed",
  ])
  assert.deepEqual(Object.keys(gptInput).sort(), ["systemMessage", "userMessage"])
  assert.match(gptInput.userMessage, /user: 이전 질문/)
  assert.match(gptInput.userMessage, /"_id": "doc-1"/)
  assert.match(gptInput.userMessage, /\[현재 질문\]\n현재 질문$/)
  assert.deepEqual(repository.calls.find(({ operation }) => operation === "history").input, {
    conversationId: "conversation-1",
    userId: "quality.kim",
    limit: 6,
  })
  const assistantSave = repository.calls.find(({ operation }) => operation === "save:assistant").input
  assert.equal(assistantSave.ragUsed, true)
  assert.equal(assistantSave.ragSources, rawHits)
  assert.equal(assistantSave.status, BACKEND_CHAT_STATUS.COMPLETED)
  assert.equal(result.answer.content, "통합 답변")
  assert.equal(result.ragSources, rawHits)
})

test("RAG 검색 결과가 0건이면 빈 Context로 GPT-OSS를 호출하고 rag_used를 false로 저장한다", async () => {
  const repository = createRepositoryMock()
  let gptUserMessage
  const service = createBackendChatService({
    historyRepository: repository,
    ragSearch: async () => ({ data: { hits: { total: { value: 0 }, hits: [] } } }),
    gptReply: async ({ userMessage }) => {
      gptUserMessage = userMessage
      return createReply("검색 결과 없는 답변")
    },
  })

  const result = await service.ask({ conversationId: "conversation-1", userId: "owner", question: "질문" })
  const assistantSave = repository.calls.find(({ operation }) => operation === "save:assistant").input
  assert.match(gptUserMessage, /RAG 검색 결과가 없습니다/)
  assert.equal(assistantSave.ragUsed, false)
  assert.deepEqual(assistantSave.ragSources, [])
  assert.equal(result.ragUsed, false)
})

test("RAG 실패를 구분하고 user message를 rag_failed로 기록한다", async () => {
  const repository = createRepositoryMock()
  const service = createBackendChatService({
    historyRepository: repository,
    ragSearch: async () => { throw new Error("RAG API 실패") },
  })

  await assert.rejects(
    service.ask({ conversationId: "conversation-1", userId: "owner", question: "질문" }),
    (error) => error instanceof BackendChatRagError
      && error.stage === "rag"
      && error.operation === "rag_search"
      && error.userMessageId === "user-message-1",
  )
  assert.equal(repository.calls.at(-1).operation, "status:rag_failed")
})

test("GPT-OSS 실패를 구분하고 user message를 gpt_failed로 기록한다", async () => {
  const repository = createRepositoryMock()
  const service = createBackendChatService({
    historyRepository: repository,
    ragSearch: async () => ({ data: { hits: { hits: rawHits } } }),
    gptReply: async () => { throw new Error("GPT-OSS API 실패") },
  })

  await assert.rejects(
    service.ask({ conversationId: "conversation-1", userId: "owner", question: "질문" }),
    (error) => error instanceof BackendChatGptOssError
      && error.stage === "gpt-oss"
      && error.operation === "gpt_oss_chat",
  )
  assert.equal(repository.calls.at(-1).operation, "status:gpt_failed")
})

test("History 조회와 assistant 저장 DB 실패를 구분하고 db_failed 기록을 시도한다", async () => {
  for (const failAt of ["history", "save:assistant"]) {
    const repository = createRepositoryMock({ failAt })
    const service = createBackendChatService({
      historyRepository: repository,
      ragSearch: async () => ({ data: { hits: { hits: rawHits } } }),
      gptReply: async () => createReply(),
    })

    await assert.rejects(
      service.ask({ conversationId: "conversation-1", userId: "owner", question: "질문" }),
      (error) => error instanceof BackendChatDbError && error.stage === "db",
    )
    assert.equal(repository.calls.at(-1).operation, "status:db_failed")
  }
})
