import assert from "node:assert/strict"
import test from "node:test"

import {
  addRagDocument,
  buildRagDocumentAddPayload,
  buildRagDocumentDeleteFields,
  buildRagSearchFields,
  deleteRagDocument,
  getRagIndex,
  loadRagConfig,
  loadRagDocumentAddConfig,
  loadRagDocumentDeleteConfig,
  loadRagIndexConfig,
  RagApiError,
  RagResponseParseError,
  searchRagDocuments,
} from "../server/ragClient.mjs"

const config = {
  url: "https://rag.example.internal/search",
  passKey: "pass-key",
  ragKey: "rag-key",
  indexName: "quality-index",
}
const commonEnvironment = {
  RAG_API_URL: config.url,
  RAG_INDEX_API_URL: "https://rag.example.internal/index",
  RAG_DOCUMENT_ADD_API_URL: "https://rag.example.internal/document/add",
  RAG_DOCUMENT_DELETE_API_URL: "https://rag.example.internal/document/delete",
  PASS_KEY: config.passKey,
  RAG_KEY: config.ragKey,
  INDEX_NAME: config.indexName,
}
const ragHeaders = {
  "Content-Type": "application/json",
  "x-dep-ticket": "pass-key",
  "api-key": "rag-key",
}

test("RAG API별 URL과 공통 환경변수를 독립적으로 읽고 누락 값을 거부한다", () => {
  assert.deepEqual(loadRagConfig(commonEnvironment), config)
  assert.deepEqual(loadRagIndexConfig(commonEnvironment), { ...config, url: commonEnvironment.RAG_INDEX_API_URL })
  assert.deepEqual(loadRagDocumentAddConfig(commonEnvironment), { ...config, url: commonEnvironment.RAG_DOCUMENT_ADD_API_URL })
  assert.deepEqual(loadRagDocumentDeleteConfig(commonEnvironment), { ...config, url: commonEnvironment.RAG_DOCUMENT_DELETE_API_URL })
  assert.throws(() => loadRagConfig({}), /RAG_API_URL, PASS_KEY, RAG_KEY, INDEX_NAME/)
  assert.throws(() => loadRagIndexConfig({}), /RAG_INDEX_API_URL, PASS_KEY, RAG_KEY, INDEX_NAME/)
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
  assert.deepEqual(actualRequest.headers, ragHeaders)
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

test("인덱스 조회 API는 공식 GET Header와 index_name Query Parameter를 유지한다", async () => {
  let actualUrl
  let actualRequest
  const fetchImpl = async (url, request) => {
    actualUrl = url
    actualRequest = request
    return new Response('{"indexes":["quality-index"]}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  const result = await getRagIndex({
    config: { ...config, url: commonEnvironment.RAG_INDEX_API_URL },
    fetchImpl,
  })
  const requestUrl = new URL(actualUrl)

  assert.equal(requestUrl.origin + requestUrl.pathname, commonEnvironment.RAG_INDEX_API_URL)
  assert.equal(requestUrl.searchParams.get("index_name"), config.indexName)
  assert.equal(actualRequest.method, "GET")
  assert.deepEqual(actualRequest.headers, ragHeaders)
  assert.equal(actualRequest.body, undefined)
  assert.deepEqual(result.data, { indexes: ["quality-index"] })
})

test("문서 추가 API는 공식 POST Header, data와 chunk_factor 구조를 유지한다", async () => {
  const document = {
    doc_id: "ABCD00001",
    title: "예시 제목",
    content: "예시 컨텐츠",
    permission_groups: ["rag-public"],
    created_time: "2025-05-29T17:02:54.917+09:00",
    additionalField: "example_field_value",
  }
  const expectedPayload = {
    index_name: "quality-index",
    data: document,
    chunk_factor: {
      logic: "fixed_size",
      chunk_size: 100,
      chunk_overlap: 50,
      separator: " ",
    },
  }
  let actualRequest
  const fetchImpl = async (_url, request) => {
    actualRequest = request
    return new Response('{"result":"created"}', { status: 200 })
  }

  assert.deepEqual(buildRagDocumentAddPayload(document, config.indexName), expectedPayload)
  await addRagDocument(document, {
    config: { ...config, url: commonEnvironment.RAG_DOCUMENT_ADD_API_URL },
    fetchImpl,
  })

  assert.equal(actualRequest.method, "POST")
  assert.deepEqual(actualRequest.headers, ragHeaders)
  assert.deepEqual(JSON.parse(actualRequest.body), expectedPayload)
})

test("문서 삭제 API는 공식 POST Header와 삭제 Request 구조를 유지한다", async () => {
  const expectedFields = {
    index_name: "quality-index",
    permission_groups: ["rag-public"],
    doc_id: "0000ABCD",
  }
  let actualRequest
  const fetchImpl = async (_url, request) => {
    actualRequest = request
    return new Response('{"result":"deleted"}', { status: 200 })
  }

  assert.deepEqual(buildRagDocumentDeleteFields("0000ABCD", config.indexName), expectedFields)
  await deleteRagDocument("0000ABCD", {
    config: { ...config, url: commonEnvironment.RAG_DOCUMENT_DELETE_API_URL },
    fetchImpl,
  })

  assert.equal(actualRequest.method, "POST")
  assert.deepEqual(actualRequest.headers, ragHeaders)
  assert.deepEqual(JSON.parse(actualRequest.body), expectedFields)
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

test("성공 응답이 JSON이 아니면 상태와 원문을 포함한 파싱 오류를 전달한다", async () => {
  const fetchImpl = async () => new Response("not-json", { status: 200 })

  await assert.rejects(
    getRagIndex({ config: { ...config, url: commonEnvironment.RAG_INDEX_API_URL }, fetchImpl }),
    (error) => error instanceof RagResponseParseError
      && error.status === 200
      && error.responseText === "not-json",
  )
})
