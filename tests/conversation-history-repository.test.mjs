import assert from "node:assert/strict"
import test from "node:test"

import {
  ConversationAccessError,
  createConversationHistoryRepository,
  createConversationPool,
  loadDbConfig,
} from "../server/conversationHistoryRepository.mjs"

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim()
}

function createDbMock(responder) {
  const calls = []
  const transaction = { begin: 0, commit: 0, rollback: 0, release: 0 }
  const execute = async (sql, params) => {
    const call = { sql: normalizeSql(sql), params }
    calls.push(call)
    return responder(call, calls.length - 1)
  }
  const connection = {
    execute,
    async beginTransaction() { transaction.begin += 1 },
    async commit() { transaction.commit += 1 },
    async rollback() { transaction.rollback += 1 },
    release() { transaction.release += 1 },
  }
  const pool = {
    execute,
    async getConnection() { return connection },
    async end() {},
  }
  return { pool, calls, transaction }
}

test("DB 환경변수와 connection pool 설정을 구성한다", () => {
  const environment = {
    DB_HOST: "db.example.internal",
    DB_USER: "quality_user",
    DB_PASSWORD: "secret",
    DB_NAME: "quality_hub",
  }
  assert.deepEqual(loadDbConfig(environment), {
    host: "db.example.internal",
    port: 3306,
    user: "quality_user",
    password: "secret",
    database: "quality_hub",
  })
  assert.throws(() => loadDbConfig({}), /DB_HOST, DB_USER, DB_PASSWORD, DB_NAME/)
  assert.throws(() => loadDbConfig({ ...environment, DB_PORT: "70000" }), /1~65535/)

  const calls = []
  const expectedPool = { pool: true }
  const mysqlImpl = { createPool(options) { calls.push(options); return expectedPool } }
  const pool = createConversationPool({ config: loadDbConfig(environment), mysqlImpl })
  assert.equal(pool, expectedPool)
  assert.deepEqual(calls, [{
    host: "db.example.internal",
    port: 3306,
    user: "quality_user",
    password: "secret",
    database: "quality_hub",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  }])
})

test("conversation을 생성하고 user_id별 목록을 parameter binding으로 조회한다", async () => {
  const conversation = {
    conversationId: "conversation-uuid",
    userId: "quality.kim",
    title: "첫 대화",
    createdAt: new Date("2026-08-10T00:00:00Z"),
    updatedAt: new Date("2026-08-10T00:00:00Z"),
  }
  const mock = createDbMock(({ sql }) => {
    if (sql.startsWith("INSERT INTO llm_conversation")) return [{ affectedRows: 1 }]
    return [[conversation]]
  })
  const repository = createConversationHistoryRepository({
    pool: mock.pool,
    uuidFactory: () => "conversation-uuid",
  })

  assert.deepEqual(await repository.createConversation({ userId: "quality.kim", title: "첫 대화" }), conversation)
  assert.deepEqual(await repository.listConversations("quality.kim"), [conversation])

  assert.deepEqual(mock.calls[0].params, ["conversation-uuid", "quality.kim", "첫 대화"])
  assert.deepEqual(mock.calls[1].params, ["conversation-uuid", "quality.kim"])
  assert.deepEqual(mock.calls[2].params, ["quality.kim"])
  assert.match(mock.calls[0].sql, /VALUES \(\?, \?, \?, CURRENT_TIMESTAMP\(6\), CURRENT_TIMESTAMP\(6\)\)/)
  assert.equal(mock.calls.some(({ sql }) => sql.includes("quality.kim") || sql.includes("첫 대화")), false)
})

test("소유권 확인 후 conversation별 message를 생성 순서로 조회한다", async () => {
  const messages = [
    { messageId: "message-1", role: "user", content: "질문" },
    { messageId: "message-2", role: "assistant", content: "답변" },
  ]
  const mock = createDbMock(({ sql }) => {
    if (sql.includes("FROM llm_conversation")) return [[{ conversationId: "conversation-1" }]]
    return [messages]
  })
  const repository = createConversationHistoryRepository({ pool: mock.pool })

  assert.deepEqual(await repository.listMessages({ conversationId: "conversation-1", userId: "owner" }), messages)
  assert.deepEqual(mock.calls[0].params, ["conversation-1", "owner"])
  assert.deepEqual(mock.calls[1].params, ["conversation-1"])
  assert.match(mock.calls[1].sql, /ORDER BY created_at ASC, message_id ASC/)
})

test("완료된 최근 message만 제한 조회하고 시간 순서로 반환한다", async () => {
  const newestFirst = [
    { messageId: "message-3", role: "user", content: "최근 질문" },
    { messageId: "message-2", role: "assistant", content: "이전 답변" },
  ]
  const mock = createDbMock(({ sql }) => {
    if (sql.includes("FROM llm_conversation")) return [[{ conversationId: "conversation-1" }]]
    return [newestFirst]
  })
  const repository = createConversationHistoryRepository({ pool: mock.pool })

  assert.deepEqual(
    await repository.listRecentMessages({ conversationId: "conversation-1", userId: "owner", limit: 2 }),
    [
      { messageId: "message-2", role: "assistant", content: "이전 답변" },
      { messageId: "message-3", role: "user", content: "최근 질문" },
    ],
  )
  assert.deepEqual(mock.calls[1].params, ["conversation-1", "completed"])
  assert.match(mock.calls[1].sql, /ORDER BY created_at DESC, message_id DESC LIMIT 2/)
  assert.equal(mock.calls[1].sql.includes("owner"), false)
  await assert.rejects(
    repository.listRecentMessages({ conversationId: "conversation-1", userId: "owner", limit: 101 }),
    /1~100/,
  )
})

test("user/assistant message 저장과 conversation updated_at 갱신을 한 transaction으로 처리한다", async () => {
  const ids = ["user-message-uuid", "assistant-message-uuid"]
  const mock = createDbMock(({ sql, params }) => {
    if (sql.includes("FROM llm_conversation")) return [[{ conversationId: "conversation-1" }]]
    if (sql.startsWith("INSERT INTO llm_message") || sql.startsWith("UPDATE llm_conversation")) {
      return [{ affectedRows: 1 }]
    }
    if (sql.includes("FROM llm_message")) return [[{ messageId: params[0] }]]
    throw new Error(`예상하지 못한 SQL: ${sql}`)
  })
  const repository = createConversationHistoryRepository({
    pool: mock.pool,
    uuidFactory: () => ids.shift(),
  })

  await repository.saveMessage({
    conversationId: "conversation-1",
    userId: "owner",
    role: "user",
    content: "질문",
  })
  await repository.saveMessage({
    conversationId: "conversation-1",
    userId: "owner",
    role: "assistant",
    content: "답변",
    modelName: "gpt-oss-120b",
    ragUsed: false,
    ragSources: [],
    status: "completed",
  })

  const inserts = mock.calls.filter(({ sql }) => sql.startsWith("INSERT INTO llm_message"))
  const updates = mock.calls.filter(({ sql }) => sql.startsWith("UPDATE llm_conversation"))
  assert.deepEqual(inserts[0].params, [
    "user-message-uuid", "conversation-1", "user", "질문", null, 0, null, "completed",
  ])
  assert.deepEqual(inserts[1].params, [
    "assistant-message-uuid", "conversation-1", "assistant", "답변", "gpt-oss-120b", 0, "[]", "completed",
  ])
  assert.deepEqual(updates.map(({ params }) => params), [
    ["conversation-1", "owner"],
    ["conversation-1", "owner"],
  ])
  assert.deepEqual(mock.transaction, { begin: 2, commit: 2, rollback: 0, release: 2 })
})

test("다른 user_id에는 message 조회·저장 권한을 주지 않는다", async () => {
  const mock = createDbMock(({ sql }) => {
    if (sql.includes("FROM llm_conversation")) return [[]]
    throw new Error("소유권 확인 뒤 SQL이 실행되면 안 됩니다.")
  })
  const repository = createConversationHistoryRepository({
    pool: mock.pool,
    uuidFactory: () => "message-uuid",
  })

  await assert.rejects(
    repository.listMessages({ conversationId: "conversation-1", userId: "other" }),
    ConversationAccessError,
  )
  await assert.rejects(
    repository.saveMessage({
      conversationId: "conversation-1",
      userId: "other",
      role: "user",
      content: "권한 없는 저장",
    }),
    ConversationAccessError,
  )
  assert.equal(mock.calls.some(({ sql }) => sql.startsWith("INSERT INTO llm_message")), false)
  assert.deepEqual(mock.transaction, { begin: 1, commit: 0, rollback: 1, release: 1 })
})

test("message 처리 상태를 소유권 확인 후 갱신한다", async () => {
  const updatedMessage = { messageId: "message-1", conversationId: "conversation-1", status: "rag_failed" }
  const mock = createDbMock(({ sql }) => {
    if (sql.includes("FROM llm_conversation")) return [[{ conversationId: "conversation-1" }]]
    if (sql.startsWith("UPDATE")) return [{ affectedRows: 1 }]
    if (sql.includes("FROM llm_message")) return [[updatedMessage]]
    throw new Error(`예상하지 못한 SQL: ${sql}`)
  })
  const repository = createConversationHistoryRepository({ pool: mock.pool })

  assert.deepEqual(await repository.updateMessageStatus({
    messageId: "message-1",
    conversationId: "conversation-1",
    userId: "owner",
    status: "rag_failed",
  }), updatedMessage)
  assert.deepEqual(mock.calls.map(({ params }) => params), [
    ["conversation-1", "owner"],
    ["rag_failed", "message-1", "conversation-1"],
    ["conversation-1", "owner"],
    ["message-1", "conversation-1"],
  ])
  assert.deepEqual(mock.transaction, { begin: 1, commit: 1, rollback: 0, release: 1 })
})

test("소유권 확인 뒤 message와 conversation을 transaction으로 삭제한다", async () => {
  const mock = createDbMock(({ sql }) => {
    if (sql.includes("FROM llm_conversation")) return [[{ conversationId: "conversation-1" }]]
    if (sql.startsWith("DELETE")) return [{ affectedRows: 1 }]
    throw new Error(`예상하지 못한 SQL: ${sql}`)
  })
  const repository = createConversationHistoryRepository({ pool: mock.pool })

  assert.deepEqual(
    await repository.deleteConversation({ conversationId: "conversation-1", userId: "owner" }),
    { conversationId: "conversation-1", deleted: true },
  )
  assert.deepEqual(mock.calls.map(({ params }) => params), [
    ["conversation-1", "owner"],
    ["conversation-1"],
    ["conversation-1", "owner"],
  ])
  assert.match(mock.calls[0].sql, /FOR UPDATE$/)
  assert.deepEqual(mock.transaction, { begin: 1, commit: 1, rollback: 0, release: 1 })
})
