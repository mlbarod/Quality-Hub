import { inspect } from "node:util"

import { getRagIndex, RagApiError, RagResponseParseError } from "../server/ragClient.mjs"

try {
  const result = await getRagIndex()
  console.log(`RAG 인덱스 조회 응답: HTTP ${result.status}`)
  console.log(`Content-Type: ${result.contentType ?? "확인되지 않음"}`)
  console.log("응답 원문:")
  console.log(result.responseText)
  console.log("파싱된 응답 구조:")
  console.log(inspect(result.data, { depth: null, colors: false, maxArrayLength: null }))
} catch (error) {
  if ((error instanceof RagApiError || error instanceof RagResponseParseError) && error.responseText) {
    console.error(error.message)
    console.error("응답 원문:")
    console.error(error.responseText)
  } else {
    console.error(error instanceof Error ? error.message : error)
  }
  process.exitCode = 1
}
