import {
  BackendChatError,
  createBackendChatService,
} from "../server/backendChatService.mjs"
import { createConversationHistoryRepository } from "../server/conversationHistoryRepository.mjs"

const [userIdInput, questionInput, conversationIdInput] = process.argv.slice(2)
const userId = userIdInput?.trim()
const question = questionInput?.trim()

if (!userId || !question) {
  console.error('사용법: npm run backend:chat:check -- "user_id" "질문" [conversation_id]')
  process.exitCode = 1
} else {
  let repository
  try {
    repository = createConversationHistoryRepository()
    let conversationId = conversationIdInput?.trim()

    if (conversationId) {
      await repository.assertConversationOwnership({ conversationId, userId })
      console.log(`기존 conversation 사용: ${conversationId}`)
    } else {
      const conversation = await repository.createConversation({
        userId,
        title: question.slice(0, 500),
      })
      conversationId = conversation.conversationId
      console.log(`새 conversation 생성: ${conversationId}`)
    }

    const service = createBackendChatService({ historyRepository: repository })
    console.log("Backend Chat 통합 흐름을 실행합니다.")
    const result = await service.ask({ conversationId, userId, question })

    console.log(`user message: ${result.userMessage.messageId} (${result.userMessage.status})`)
    console.log(`assistant message: ${result.assistantMessage.messageId} (${result.assistantMessage.status})`)
    console.log(`최근 History: ${result.historyCount}건`)
    console.log(`RAG 사용: ${result.ragUsed ? "예" : "아니요"} / 출처 ${result.ragSources.length}건`)
    console.log(`GPT-OSS 모델: ${result.answer.model ?? "gpt-oss-120b"}`)
    console.log("답변:")
    console.log(result.answer.content)
    console.log("RAG 출처 JSON:")
    console.log(JSON.stringify(result.ragSources, null, 2))
  } catch (error) {
    if (error instanceof BackendChatError) {
      console.error(`Backend Chat 실패 단계: ${error.stage}`)
      console.error(`실패 작업: ${error.operation}`)
      console.error(error.message)
      if (error.userMessageId) console.error(`user message: ${error.userMessageId}`)
      if (error.cause instanceof Error) console.error(`원인: ${error.cause.message}`)
      if (error.statusUpdateError instanceof Error) {
        console.error(`실패 상태 DB 기록도 실패했습니다: ${error.statusUpdateError.message}`)
      }
    } else {
      console.error(error instanceof Error ? error.message : error)
    }
    if (error && typeof error === "object" && "code" in error) {
      console.error(`Error code: ${error.code}`)
    }
    process.exitCode = 1
  } finally {
    if (repository) await repository.close()
  }
}
