import assert from "node:assert/strict"
import { once } from "node:events"
import test from "node:test"

import { BackendChatGptOssError } from "../server/backendChatService.mjs"
import { createAgentChatApi } from "../server/agentChatApi.mjs"
import { createQualityHubServer, sourceStaticDir } from "../server.mjs"

async function startApiServer(agentApi) {
  const server = createQualityHubServer({ staticDir: sourceStaticDir, agentApi })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

async function closeServer(server) {
  const closed = once(server, "close")
  server.close()
  server.closeIdleConnections?.()
  await closed
}

function createApiFixture({ chatError } = {}) {
  const calls = []
  const conversation = {
    conversationId: "conversation-1",
    userId: "quality.kim",
    title: "새 대화",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  }
  const storedMessages = [{
    messageId: "message-1",
    conversationId: "conversation-1",
    role: "assistant",
    content: "<script>실행하면 안 됩니다</script>",
    modelName: "gpt-oss-120b",
    ragUsed: 1,
    ragSources: '[{"_id":"doc-1","_source":{"title":"기준 문서"}}]',
    status: "completed",
    createdAt: "2026-08-11T00:00:01.000Z",
  }]
  const historyRepository = {
    async listConversations(userId) {
      calls.push(["listConversations", userId])
      return [conversation]
    },
    async createConversation({ userId, title }) {
      calls.push(["createConversation", userId, title])
      return { ...conversation, userId, title }
    },
    async listMessages({ conversationId, userId }) {
      calls.push(["listMessages", conversationId, userId])
      return storedMessages
    },
    async deleteConversation({ conversationId, userId }) {
      calls.push(["deleteConversation", conversationId, userId])
      return { conversationId, deleted: true }
    },
  }
  const chatService = {
    async ask({ conversationId, userId, question }) {
      calls.push(["ask", conversationId, userId, question])
      if (chatError) throw chatError
      return {
        conversationId,
        userMessage: { ...storedMessages[0], messageId: "user-message", role: "user", content: question, ragUsed: 0, ragSources: null },
        assistantMessage: storedMessages[0],
        answer: { content: storedMessages[0].content, model: "gpt-oss-120b" },
        historyCount: 0,
        ragUsed: true,
        ragSources: [{ _id: "doc-1", _source: { title: "기준 문서" } }],
      }
    },
  }
  return {
    calls,
    agentApi: createAgentChatApi({ historyRepository, chatService, logger: { error() {} } }),
  }
}

function apiRequest(baseUrl, path, { method = "GET", userId = "quality.kim", body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(userId ? { "X-Quality-Hub-User-Id": userId } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

test("테스트 user_id Header로 conversation 목록·생성·삭제 API를 제공한다", async (t) => {
  const fixture = createApiFixture()
  const { server, baseUrl } = await startApiServer(fixture.agentApi)
  t.after(() => closeServer(server))

  const listResponse = await apiRequest(baseUrl, "/api/agent/conversations")
  assert.equal(listResponse.status, 200)
  assert.equal((await listResponse.json()).conversations[0].conversationId, "conversation-1")

  const createResponse = await apiRequest(baseUrl, "/api/agent/conversations", {
    method: "POST",
    body: { title: "새 질문" },
  })
  assert.equal(createResponse.status, 201)
  assert.equal((await createResponse.json()).conversation.title, "새 질문")

  const deleteResponse = await apiRequest(baseUrl, "/api/agent/conversations/conversation-1", { method: "DELETE" })
  assert.equal(deleteResponse.status, 200)
  assert.deepEqual(await deleteResponse.json(), { conversationId: "conversation-1", deleted: true })
  assert.deepEqual(fixture.calls, [
    ["listConversations", "quality.kim"],
    ["createConversation", "quality.kim", "새 질문"],
    ["deleteConversation", "conversation-1", "quality.kim"],
  ])
})

test("message History와 Backend Chat 결과의 RAG 출처를 JSON으로 반환한다", async (t) => {
  const fixture = createApiFixture()
  const { server, baseUrl } = await startApiServer(fixture.agentApi)
  t.after(() => closeServer(server))

  const messagesResponse = await apiRequest(baseUrl, "/api/agent/conversations/conversation-1/messages")
  assert.equal(messagesResponse.status, 200)
  const messagesPayload = await messagesResponse.json()
  assert.equal(messagesPayload.messages[0].content, "<script>실행하면 안 됩니다</script>")
  assert.equal(messagesPayload.messages[0].ragUsed, true)
  assert.deepEqual(messagesPayload.messages[0].ragSources, [{ _id: "doc-1", _source: { title: "기준 문서" } }])

  const chatResponse = await apiRequest(baseUrl, "/api/agent/conversations/conversation-1/messages", {
    method: "POST",
    body: { question: "현재 질문" },
  })
  assert.equal(chatResponse.status, 200)
  const chatPayload = await chatResponse.json()
  assert.equal(chatPayload.assistantMessage.content, "<script>실행하면 안 됩니다</script>")
  assert.deepEqual(fixture.calls, [
    ["listMessages", "conversation-1", "quality.kim"],
    ["ask", "conversation-1", "quality.kim", "현재 질문"],
  ])
})

test("사용자 식별 누락과 GPT-OSS 실패를 이해 가능한 API 오류로 구분한다", async (t) => {
  const fixture = createApiFixture({ chatError: new BackendChatGptOssError("실패") })
  const { server, baseUrl } = await startApiServer(fixture.agentApi)
  t.after(() => closeServer(server))

  const unauthorized = await apiRequest(baseUrl, "/api/agent/conversations", { userId: "" })
  assert.equal(unauthorized.status, 401)
  assert.equal((await unauthorized.json()).error.code, "USER_ID_REQUIRED")

  const failedChat = await apiRequest(baseUrl, "/api/agent/conversations/conversation-1/messages", {
    method: "POST",
    body: { question: "질문" },
  })
  assert.equal(failedChat.status, 502)
  assert.deepEqual(await failedChat.json(), {
    error: {
      code: "GPT_OSS_FAILED",
      message: "답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    },
  })
})

test("DB 설정 또는 Repository 초기화 실패를 DB 오류로 구분한다", async (t) => {
  const failureLogs = []
  const agentApi = createAgentChatApi({
    repositoryFactory() {
      throw Object.assign(new Error("private-db-host 정보가 포함된 원본 오류"), {
        code: "ER_ACCESS_DENIED_ERROR",
        errno: 1045,
        sqlState: "28000",
      })
    },
    logger: { error(...args) { failureLogs.push(args) } },
  })
  const { server, baseUrl } = await startApiServer(agentApi)
  t.after(() => closeServer(server))

  const response = await apiRequest(baseUrl, "/api/agent/conversations")

  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {
    error: {
      code: "DB_FAILED",
      message: "대화 내용을 저장하거나 불러오지 못했습니다.",
    },
  })
  assert.deepEqual(failureLogs, [[
    "Quality Agent API failure",
    {
      method: "GET",
      route: "conversations",
      apiCode: "DB_FAILED",
      status: 503,
      stage: "db",
      operation: "initialize_repository",
      errorName: "Error",
      dbCode: "ER_ACCESS_DENIED_ERROR",
      errno: 1045,
      sqlState: "28000",
    },
  ]])
  assert.doesNotMatch(JSON.stringify(failureLogs), /private-db-host/)
})
