import assert from "node:assert/strict"
import test from "node:test"

import {
  buildRagSearchFields,
  loadRagConfig,
  RagApiError,
  searchRagDocuments,
} from "../server/ragClient.mjs"

const config = {
  url: "https://rag.example.internal/search",
  passKey: "pass-key",
  ragKey: "rag-key",
  indexName: "quality-index",
}

test("RAG 환경변수 네 값을 읽고 누락 값을 거부한다", () => {
  assert.deepEqual(loadRagConfig({
    RAG_API_URL: config.url,
    PASS_KEY: config.passKey,
    RAG_KEY: config.ragKey,
    INDEX_NAME: config.indexName,
  }), config)
  assert.throws(() => loadRagConfig({}), /RAG_API_URL, PASS_KEY, RAG_KEY, INDEX_NAME/)
})

test("공식 가이드의 RAG 검색 필드와 고정값을 유지한다", () => {
  assert.deepEqual(buildRagSearchFields("반도체에 대해 알려주세요", config.indexName), {
    index_name: "quality-index",
    permission_groups: ["rag-public"],
    query_text: "반도체에 대해 알려주세요",
    num_result_doc: 5,
    fields_exclude: ["v_merge_title_content"],
  })
})

test("공식 URL, POST Header와 JSON Request 구조로 호출하고 응답 원문을 보존한다", async () => {
  let actualUrl
  let actualRequest
  const responseBody = { result: [{ document_id: "doc-1" }] }
  const fetchImpl = async (url, request) => {
    actualUrl = url
    actualRequest = request
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  const result = await searchRagDocuments("질문 원문", { config, fetchImpl })

  assert.equal(actualUrl, config.url)
  assert.equal(actualRequest.method, "POST")
  assert.deepEqual(actualRequest.headers, {
    "Content-Type": "application/json",
    "x-dep-ticket": "pass-key",
    "api-key": "rag-key",
  })
  assert.deepEqual(JSON.parse(actualRequest.body), {
    index_name: "quality-index",
    permission_groups: ["rag-public"],
    query_text: "질문 원문",
    num_result_doc: 5,
    fields_exclude: ["v_merge_title_content"],
  })
  assert.equal(result.status, 200)
  assert.equal(result.responseText, JSON.stringify(responseBody))
  assert.deepEqual(result.data, responseBody)
})

test("RAG 오류 응답의 HTTP 상태와 원문을 전달한다", async () => {
  const fetchImpl = async () => new Response('{"message":"unauthorized"}', { status: 401 })

  await assert.rejects(
    searchRagDocuments("질문", { config, fetchImpl }),
    (error) => error instanceof RagApiError
      && error.status === 401
      && error.responseText === '{"message":"unauthorized"}',
  )
})
