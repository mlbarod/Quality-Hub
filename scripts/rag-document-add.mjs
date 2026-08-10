import { inspect } from "node:util"

import { addRagDocument, RagApiError, RagResponseParseError } from "../server/ragClient.mjs"

const document = {
  doc_id: "ABCD00001",
  title: "예시 제목",
  content: "예시 컨텐츠",
  permission_groups: ["rag-public"],
  created_time: "2025-05-29T17:02:54.917+09:00",
  additionalField: "example_field_value",
}

try {
  const result = await addRagDocument(document)
  console.log(`RAG 문서 추가 응답: HTTP ${result.status}`)
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
