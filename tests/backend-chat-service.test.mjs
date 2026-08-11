import assert from "node:assert/strict"
import test from "node:test"

import {
  BACKEND_CHAT_STATUS,
  BackendChatDbError,
  BackendChatGptOssError,
  BackendChatRagError,
  buildChatMessages,
  buildChatUserMessage,
  buildRagContext,
  createBackendChatService,
  RagHitsStructureError,
  selectChatHistory,
} from "../server/backendChatService.mjs"

const rawHits = [
  {
    _index: "quality-index",
    _id: "doc-1",
    _score: 1.25,
    _source: {
      doc_id: "DOC-1",
      title: "관리 기준",
      content: "기준 내용",
      additionalField: "Prompt에 포함하면 안 되는 metadata",
    },
    sort: [1.25],
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

test("RAG Context는 알려진 title, content, score만 추출하고 metadata를 제외한다", () => {
  const withHits = buildRagContext({ hits: { total: { value: 1 }, hits: rawHits } })
  assert.deepEqual(withHits.hits, rawHits)
  assert.deepEqual(withHits.contextHits, [{ title: "관리 기준", content: "기준 내용", score: 1.25 }])
  assert.match(withHits.context, /제목: 관리 기준/)
  assert.match(withHits.context, /관련도 점수: 1\.25/)
  assert.match(withHits.context, /내용:\n기준 내용/)
  assert.doesNotMatch(withHits.context, /quality-index|doc-1|additionalField|metadata|sort|_source/)

  const unknownContentFieldHit = {
    _index: "quality-index",
    _id: "doc-unknown",
    _score: 0.5,
    _source: { title: "다른 본문 구조", page_content: "실제 검색 본문" },
    sort: [0.5],
  }
  const withFallback = buildRagContext({
    hits: { hits: [unknownContentFieldHit] },
  })
  assert.deepEqual(withFallback.hits, [unknownContentFieldHit])
  assert.deepEqual(withFallback.contextHits, [null])
  assert.match(withFallback.context, /검색 결과 데이터:/)
  assert.match(withFallback.context, /"page_content": "실제 검색 본문"/)
  assert.doesNotMatch(withFallback.context, /quality-index|doc-unknown|"sort"/)

  assert.deepEqual(buildRagContext({ hits: { total: { value: 0 }, hits: [] } }), {
    hits: [],
    contextHits: [],
    context: "RAG 검색 결과가 없습니다.",
  })
  assert.throws(() => buildRagContext({ result: [] }), RagHitsStructureError)
})

test("RAG Context와 현재 질문만 구분한 현재 user 메시지를 만든다", () => {
  const prompt = buildChatUserMessage({
    ragContext: "문서 Context",
    question: "현재 질문",
  })
  assert.match(prompt, /\[RAG Context\]\n문서 Context/)
  assert.match(prompt, /\[현재 질문\]\n현재 질문$/)
  assert.doesNotMatch(prompt, /최근 대화 History/)
})

test("History는 최근 6개를 실제 role로 유지하고 총 문자 예산 안에서 자른다", () => {
  const history = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `${index + 1}-${"가".repeat(100)}`,
  }))
  const selected = selectChatHistory(history, { messageLimit: 6, charLimit: 300 })

  assert.equal(selected.length, 6)
  assert.deepEqual(selected.map(({ role }) => role), ["user", "assistant", "user", "assistant", "user", "assistant"])
  assert.match(selected[0].content, /^3-/)
  assert.ok(selected.reduce((total, message) => total + message.content.length, 0) <= 300)
  assert.ok(selected.every((message) => message.content.includes("[History 일부 생략]")))

  assert.throws(
    () => selectChatHistory(history, { messageLimit: 6, charLimit: 1 }),
    /historyCharLimit은 6 이상의 정수/,
  )

  const messages = buildChatMessages({
    history: [
      { role: "user", content: "이전 질문" },
      { role: "assistant", content: "이전 답변" },
    ],
    ragContext: "문서 Context",
    question: "현재 질문",
    systemMessage: "시스템 지시",
  })
  assert.deepEqual(messages.slice(0, 3), [
    { role: "system", content: "시스템 지시" },
    { role: "user", content: "이전 질문" },
    { role: "assistant", content: "이전 답변" },
  ])
  assert.equal(messages.at(-1).role, "user")
  assert.match(messages.at(-1).content, /\[현재 질문\]\n현재 질문$/)
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
  assert.deepEqual(Object.keys(gptInput), ["messages"])
  assert.deepEqual(gptInput.messages.slice(1, 3), [
    { role: "user", content: "이전 질문" },
    { role: "assistant", content: "이전 답변" },
  ])
  assert.match(gptInput.messages.at(-1).content, /제목: 관리 기준/)
  assert.match(gptInput.messages.at(-1).content, /내용:\n기준 내용/)
  assert.doesNotMatch(gptInput.messages.at(-1).content, /"_id"|additionalField|metadata|sort/)
  assert.match(gptInput.messages.at(-1).content, /\[현재 질문\]\n현재 질문$/)
  assert.deepEqual(repository.calls.find(({ operation }) => operation === "history").input, {
    conversationId: "conversation-1",
    userId: "quality.kim",
    limit: 6,
  })
  const assistantSave = repository.calls.find(({ operation }) => operation === "save:assistant").input
  assert.equal(assistantSave.ragUsed, true)
  assert.deepEqual(assistantSave.ragSources, rawHits)
  assert.equal(assistantSave.status, BACKEND_CHAT_STATUS.COMPLETED)
  assert.equal(result.answer.content, "통합 답변")
  assert.deepEqual(result.ragSources, rawHits)
  assert.equal(result.historyCount, 2)
})

test("RAG 검색 결과가 0건이면 빈 Context로 GPT-OSS를 호출하고 rag_used를 false로 저장한다", async () => {
  const repository = createRepositoryMock()
  let gptMessages
  const service = createBackendChatService({
    historyRepository: repository,
    ragSearch: async () => ({ data: { hits: { total: { value: 0 }, hits: [] } } }),
    gptReply: async ({ messages }) => {
      gptMessages = messages
      return createReply("검색 결과 없는 답변")
    },
  })

  const result = await service.ask({ conversationId: "conversation-1", userId: "owner", question: "질문" })
  const assistantSave = repository.calls.find(({ operation }) => operation === "save:assistant").input
  assert.match(gptMessages.at(-1).content, /RAG 검색 결과가 없습니다/)
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
