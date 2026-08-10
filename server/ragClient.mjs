const SHARED_CONFIG_NAMES = ["PASS_KEY", "RAG_KEY", "INDEX_NAME"]

export class RagApiError extends Error {
  constructor(message, { status, responseText } = {}) {
    super(message)
    this.name = "RagApiError"
    this.status = status
    this.responseText = responseText
  }
}

export class RagResponseParseError extends Error {
  constructor(message, { status, responseText } = {}) {
    super(message)
    this.name = "RagResponseParseError"
    this.status = status
    this.responseText = responseText
  }
}

function loadEndpointConfig(urlName, environment) {
  const requiredConfig = [urlName, ...SHARED_CONFIG_NAMES]
  const missing = requiredConfig.filter((name) => typeof environment[name] !== "string" || environment[name].length === 0)
  if (missing.length > 0) {
    throw new Error(`RAG API 환경변수가 필요합니다: ${missing.join(", ")}`)
  }

  return {
    url: environment[urlName],
    passKey: environment.PASS_KEY,
    ragKey: environment.RAG_KEY,
    indexName: environment.INDEX_NAME,
  }
}

export function loadRagConfig(environment = process.env) {
  return loadEndpointConfig("RAG_API_URL", environment)
}

export function loadRagIndexConfig(environment = process.env) {
  return loadEndpointConfig("RAG_INDEX_API_URL", environment)
}

export function loadRagDocumentAddConfig(environment = process.env) {
  return loadEndpointConfig("RAG_DOCUMENT_ADD_API_URL", environment)
}

export function loadRagDocumentDeleteConfig(environment = process.env) {
  return loadEndpointConfig("RAG_DOCUMENT_DELETE_API_URL", environment)
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldName} 값을 입력해 주세요.`)
  }
  return value
}

function createRagHeaders(config) {
  return {
    "Content-Type": "application/json",
    "x-dep-ticket": config.passKey,
    "api-key": config.ragKey,
  }
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("RAG API 호출에 사용할 fetch 함수가 필요합니다.")
  }
}

async function readRagResponse(response, operationName) {
  const responseText = await response.text()

  if (!response.ok) {
    throw new RagApiError(`${operationName} API 호출에 실패했습니다. HTTP ${response.status}`, {
      status: response.status,
      responseText,
    })
  }

  let data
  try {
    data = JSON.parse(responseText)
  } catch {
    throw new RagResponseParseError(`${operationName} API 응답을 JSON으로 해석할 수 없습니다.`, {
      status: response.status,
      responseText,
    })
  }

  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    responseText,
    data,
  }
}

export function buildRagSearchFields(queryText, indexName) {
  requireText(queryText, "RAG 검색 질문")

  return {
    index_name: indexName,
    permission_groups: ["rag-public"],
    query_text: queryText,
    num_result_doc: 5,
    fields_exclude: ["v_merge_title_content"],
  }
}

export function buildRagDocumentAddPayload(document, indexName) {
  if (!document || typeof document !== "object") {
    throw new TypeError("추가할 RAG 문서 정보가 필요합니다.")
  }

  return {
    index_name: indexName,
    data: {
      doc_id: requireText(document.doc_id, "doc_id"),
      title: requireText(document.title, "title"),
      content: requireText(document.content, "content"),
      permission_groups: ["rag-public"],
      created_time: requireText(document.created_time, "created_time"),
      additionalField: requireText(document.additionalField, "additionalField"),
    },
    chunk_factor: {
      logic: "fixed_size",
      chunk_size: 100,
      chunk_overlap: 50,
      separator: " ",
    },
  }
}

export function buildRagDocumentDeleteFields(docId, indexName) {
  return {
    index_name: indexName,
    permission_groups: ["rag-public"],
    doc_id: requireText(docId, "doc_id"),
  }
}

export async function searchRagDocuments(queryText, {
  config = loadRagConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  requireFetch(fetchImpl)

  const fields = buildRagSearchFields(queryText, config.indexName)
  const response = await fetchImpl(config.url, {
    method: "POST",
    headers: createRagHeaders(config),
    body: JSON.stringify(fields),
  })

  return readRagResponse(response, "RAG 문서 검색")
}

export async function getRagIndex({
  config = loadRagIndexConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  requireFetch(fetchImpl)

  const url = new URL(config.url)
  url.searchParams.set("index_name", config.indexName)
  const response = await fetchImpl(url, {
    method: "GET",
    headers: createRagHeaders(config),
  })

  return readRagResponse(response, "RAG 인덱스 조회")
}

export async function addRagDocument(document, {
  config = loadRagDocumentAddConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  requireFetch(fetchImpl)

  const payload = buildRagDocumentAddPayload(document, config.indexName)
  const response = await fetchImpl(config.url, {
    method: "POST",
    headers: createRagHeaders(config),
    body: JSON.stringify(payload),
  })

  return readRagResponse(response, "RAG 문서 추가")
}

export async function deleteRagDocument(docId, {
  config = loadRagDocumentDeleteConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  requireFetch(fetchImpl)

  const fields = buildRagDocumentDeleteFields(docId, config.indexName)
  const response = await fetchImpl(config.url, {
    method: "POST",
    headers: createRagHeaders(config),
    body: JSON.stringify(fields),
  })

  return readRagResponse(response, "RAG 문서 삭제")
}
