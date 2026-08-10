import { inspect } from "node:util"

import { RagApiError, searchRagDocuments } from "../server/ragClient.mjs"

const queryText = process.argv.slice(2).join(" ").trim()

if (!queryText) {
  console.error('사용법: npm run rag:search -- "검색할 질문"')
  process.exitCode = 1
} else {
  try {
    const result = await searchRagDocuments(queryText)
    console.log(`RAG API 응답: HTTP ${result.status}`)
    console.log(`Content-Type: ${result.contentType ?? "확인되지 않음"}`)
    console.log("응답 원문:")
    console.log(result.responseText)
    console.log("파싱된 응답 구조:")
    console.log(inspect(result.data, { depth: null, colors: false, maxArrayLength: null }))
  } catch (error) {
    if (error instanceof RagApiError && error.responseText) {
      console.error(error.message)
      console.error("오류 응답 원문:")
      console.error(error.responseText)
    } else {
      console.error(error instanceof Error ? error.message : error)
    }
    process.exitCode = 1
  }
}
