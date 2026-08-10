import {
  GptOssApiError,
  GptOssResponseError,
  GptOssTimeoutError,
} from "../server/gptOssClient.mjs"
import { generateGptOssReply } from "../server/gptOssService.mjs"

const [systemInput, userInput] = process.argv.slice(2)
const systemMessage = systemInput?.trim() || "You are a helpful assistant."
const userMessage = userInput?.trim() || "How are you?"

try {
  const result = await generateGptOssReply({ systemMessage, userMessage })
  console.log(`GPT-OSS 모델: ${result.model ?? "gpt-oss-120b"}`)
  console.log(`Prompt-Msg-Id: ${result.promptMessageId}`)
  console.log(`Completion-Msg-Id: ${result.completionMessageId}`)
  console.log(`Finish reason: ${result.finishReason ?? "확인되지 않음"}`)
  console.log("답변:")
  console.log(result.content)
} catch (error) {
  if (error instanceof GptOssTimeoutError) {
    console.error(error.message)
  } else if (error instanceof GptOssApiError) {
    console.error(error.message)
    if (error.requestId) console.error(`Request ID: ${error.requestId}`)
    if (error.code) console.error(`Error code: ${error.code}`)
  } else if (error instanceof GptOssResponseError) {
    console.error(error.message)
  } else {
    console.error(error instanceof Error ? error.message : error)
  }
  process.exitCode = 1
}
