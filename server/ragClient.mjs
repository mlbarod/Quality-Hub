const REQUIRED_CONFIG = ["RAG_API_URL", "PASS_KEY", "RAG_KEY", "INDEX_NAME"]

export class RagApiError extends Error {
  constructor(message, { status, responseText } = {}) {
    super(message)
    this.name = "RagApiError"
    this.status = status
    this.responseText = responseText
  }
}

export function loadRagConfig(environment = process.env) {
  const missing = REQUIRED_CONFIG.filter((name) => typeof environment[name] !== "string" || environment[name].length === 0)
  if (missing.length > 0) {
    throw new Error(`RAG API 환경변수가 필요합니다: ${missing.join(", ")}`)
  }

  return {
    url: environment.RAG_API_URL,
    passKey: environment.PASS_KEY,
    ragKey: environment.RAG_KEY,
    indexName: environment.INDEX_NAME,
  }
}

export function buildRagSearchFields(queryText, indexName) {
  if (typeof queryText !== "string" || queryText.trim().length === 0) {
    throw new TypeError("RAG 검색 질문을 입력해 주세요.")
  }

  return {
    index_name: indexName,
    permission_groups: ["rag-public"],
    query_text: queryText,
    num_result_doc: 5,
    fields_exclude: ["v_merge_title_content"],
    filter: {
      example_field_name: ["png"],
    },
  }
}

function parseResponseText(responseText) {
  try {
    return JSON.parse(responseText)
  } catch {
    return responseText
  }
}

export async function searchRagDocuments(queryText, {
  config = loadRagConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("RAG API 호출에 사용할 fetch 함수가 필요합니다.")
  }

  const fields = buildRagSearchFields(queryText, config.indexName)
  const response = await fetchImpl(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dep-ticket": config.passKey,
      "api-key": config.ragKey,
    },
    body: JSON.stringify(fields),
  })
  const responseText = await response.text()

  if (!response.ok) {
    throw new RagApiError(`RAG API 호출에 실패했습니다. HTTP ${response.status}`, {
      status: response.status,
      responseText,
    })
  }

  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    responseText,
    data: parseResponseText(responseText),
  }
}
