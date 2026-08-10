import { randomUUID } from "node:crypto"

import {
  ConversationAccessError,
  createConversationHistoryRepository,
} from "../server/conversationHistoryRepository.mjs"

const requestedUserId = process.argv[2]?.trim()
const userId = requestedUserId || `db-check-${randomUUID()}`
const unauthorizedUserId = `db-check-other-${randomUUID()}`

let repository
let conversationId
let deleted = false

try {
  repository = createConversationHistoryRepository()
  console.log("1/7 DB connection pool 및 conversation 생성을 확인합니다.")
  const conversation = await repository.createConversation({
    userId,
    title: `Quality Hub DB CRUD 확인 ${new Date().toISOString()}`,
  })
  conversationId = conversation.conversationId
  console.log(`   생성됨: ${conversationId}`)

  console.log("2/7 사용자별 conversation 목록 조회를 확인합니다.")
  const conversations = await repository.listConversations(userId)
  if (!conversations.some((item) => item.conversationId === conversationId)) {
    throw new Error("생성한 conversation이 사용자 목록에서 조회되지 않았습니다.")
  }

  console.log("3/7 user message 저장을 확인합니다.")
  await repository.saveMessage({
    conversationId,
    userId,
    role: "user",
    content: "DB History 독립 검증용 사용자 메시지입니다.",
    status: "completed",
  })

  console.log("4/7 assistant message 저장을 확인합니다.")
  await repository.saveMessage({
    conversationId,
    userId,
    role: "assistant",
    content: "DB History 독립 검증용 assistant 메시지입니다.",
    modelName: "gpt-oss-120b",
    status: "completed",
  })

  console.log("5/7 conversation별 message 조회를 확인합니다.")
  const messages = await repository.listMessages({ conversationId, userId })
  if (messages.length !== 2 || messages[0].role !== "user" || messages[1].role !== "assistant") {
    throw new Error("저장한 user/assistant message가 예상한 순서로 조회되지 않았습니다.")
  }

  console.log("6/7 다른 user_id의 접근 차단을 확인합니다.")
  try {
    await repository.listMessages({ conversationId, userId: unauthorizedUserId })
    throw new Error("다른 user_id로 conversation에 접근할 수 있습니다.")
  } catch (error) {
    if (!(error instanceof ConversationAccessError)) throw error
  }

  console.log("7/7 conversation과 소속 message 삭제를 확인합니다.")
  await repository.deleteConversation({ conversationId, userId })
  deleted = true
  try {
    await repository.assertConversationOwnership({ conversationId, userId })
    throw new Error("삭제한 conversation이 계속 조회됩니다.")
  } catch (error) {
    if (!(error instanceof ConversationAccessError)) throw error
  }

  console.log("DB History 독립 CRUD 검증 완료")
} catch (error) {
  console.error("DB History 독립 CRUD 검증 실패")
  console.error(error instanceof Error ? error.message : error)
  if (error && typeof error === "object" && "code" in error) {
    console.error(`DB error code: ${error.code}`)
  }
  process.exitCode = 1
} finally {
  if (repository && conversationId && !deleted) {
    try {
      await repository.deleteConversation({ conversationId, userId })
      console.log(`검증 중 생성한 conversation 정리 완료: ${conversationId}`)
    } catch (cleanupError) {
      if (!(cleanupError instanceof ConversationAccessError)) {
        console.error(`검증 데이터 정리 실패: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`)
      }
    }
  }
  if (repository) await repository.close()
}
