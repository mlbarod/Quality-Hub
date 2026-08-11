import {
  createGptOssChatCompletion,
  GptOssResponseError,
} from "./gptOssClient.mjs"

export async function generateGptOssReply(input, options = {}) {
  const result = await createGptOssChatCompletion(input, options)
  const choice = result.completion?.choices?.[0]
  const content = choice?.message?.content

  if (typeof content !== "string" || content.length === 0) {
    throw new GptOssResponseError("GPT-OSS 응답에 choices[0].message.content가 없습니다.", {
      completion: result.completion,
    })
  }

  return {
    content,
    completionId: result.completion.id,
    model: result.completion.model,
    finishReason: choice.finish_reason,
    usage: result.completion.usage,
    promptMessageId: result.promptMessageId,
    completionMessageId: result.completionMessageId,
  }
}
