import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"

import { createRuleSopApi } from "../server/ruleSopApi.mjs"

async function callApi(repository, { method = "GET", headers = {}, url = "/api/rules", body, api } = {}) {
  const activeApi = api ?? createRuleSopApi({ repository, logger: { error() {} }, uuidFactory: () => "document-1" })
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = { host: "localhost", ...headers }
  const response = {
    statusCode: null,
    headers: {},
    body: "",
    writeHead(statusCode, responseHeaders) {
      this.statusCode = statusCode
      this.headers = Object.fromEntries(Object.entries(responseHeaders).map(([name, value]) => [name.toLowerCase(), String(value)]))
    },
    end(value = "") {
      this.body += value
    },
  }
  await activeApi.handle(req, response)
  return response
}

test("Rule&SOP API는 화면에 필요한 다섯 컬럼만 반환한다", async () => {
  const repository = {
    async listDocuments() {
      return [{
        mainCategory: "대분류",
        subCategory: "중분류",
        item: "소분류",
        title: "업무 표준",
        url: "https://quality.internal/rules/1",
        regUser: "quality.kim",
        regDate: "2026-08-14T01:00:00.000Z",
      }]
    },
  }
  const response = await callApi(repository, { headers: { "x-quality-hub-user-id": "quality.kim" } })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), {
    documents: [{
      documentId: "document-1",
      mainCategory: "대분류",
      subCategory: "중분류",
      item: "소분류",
      title: "업무 표준",
      url: "https://quality.internal/rules/1",
    }],
  })
  assert.doesNotMatch(response.body, /quality\.kim|regDate/)
  assert.equal(response.headers["cache-control"], "no-store")
})

test("Rule&SOP API는 사용자 식별값과 경로별 허용 메서드를 검증한다", async () => {
  const repository = { async listDocuments() { return [] } }
  const unauthenticated = await callApi(repository)
  assert.equal(unauthenticated.statusCode, 401)
  assert.equal(JSON.parse(unauthenticated.body).error.code, "USER_ID_REQUIRED")

  const unsupported = await callApi(repository, {
    method: "POST",
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })
  assert.equal(unsupported.statusCode, 405)
  assert.equal(unsupported.headers.allow, "GET")

  const unsupportedDocument = await callApi(repository, {
    method: "POST",
    url: "/api/rules/document-1",
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })
  assert.equal(unsupportedDocument.statusCode, 405)
  assert.equal(unsupportedDocument.headers.allow, "PATCH, DELETE")
})

test("Rule&SOP API는 조회 때 발급한 사용자별 임시 ID로 수정한다", async () => {
  const original = {
    mainCategory: "대분류",
    subCategory: "중분류",
    item: "소분류",
    title: "기존 제목",
    url: "https://quality.internal/rules/1",
    regUser: "quality.kim",
    regDate: "2026-08-14T01:00:00.000Z",
  }
  let receivedReference
  let receivedInput
  const repository = {
    async listDocuments() { return [original] },
    async updateDocument(reference, input) {
      receivedReference = reference
      receivedInput = input
      return input
    },
  }
  const api = createRuleSopApi({ repository, logger: { error() {} }, uuidFactory: () => "document-edit" })
  await callApi(repository, { api, headers: { "x-quality-hub-user-id": "quality.kim" } })
  const body = {
    mainCategory: "변경 대분류",
    subCategory: "변경 중분류",
    item: "변경 소분류",
    title: "변경 제목",
    url: "https://quality.internal/rules/2",
  }
  const response = await callApi(repository, {
    api,
    method: "PATCH",
    url: "/api/rules/document-edit",
    headers: { "Content-Type": "application/json", "x-quality-hub-user-id": "quality.kim" },
    body,
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(receivedReference, original)
  assert.deepEqual(receivedInput, body)
  assert.deepEqual(JSON.parse(response.body), { document: body })
})

test("Rule&SOP API는 조회 때 발급한 사용자별 임시 ID로 실제 삭제한다", async () => {
  const original = {
    mainCategory: "대분류",
    subCategory: "중분류",
    item: "소분류",
    title: "삭제 제목",
    url: "https://quality.internal/rules/1",
    regUser: "quality.kim",
    regDate: "2026-08-14T01:00:00.000Z",
  }
  let deletedReference
  const repository = {
    async listDocuments() { return [original] },
    async deleteDocument(reference) {
      deletedReference = reference
      return { deleted: true }
    },
  }
  const api = createRuleSopApi({ repository, logger: { error() {} }, uuidFactory: () => "document-delete" })
  await callApi(repository, { api, headers: { "x-quality-hub-user-id": "quality.kim" } })
  const response = await callApi(repository, {
    api,
    method: "DELETE",
    url: "/api/rules/document-delete",
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(deletedReference, original)
  assert.deepEqual(JSON.parse(response.body), { deleted: true })
})

test("Rule&SOP 임시 ID는 발급 사용자 외에는 수정하거나 삭제할 수 없다", async () => {
  const repository = { async listDocuments() { return [{ title: "문서" }] } }
  const api = createRuleSopApi({ repository, logger: { error() {} }, uuidFactory: () => "private-document" })
  await callApi(repository, { api, headers: { "x-quality-hub-user-id": "quality.kim" } })
  const response = await callApi(repository, {
    api,
    method: "DELETE",
    url: "/api/rules/private-document",
    headers: { "x-quality-hub-user-id": "other.user" },
  })

  assert.equal(response.statusCode, 404)
  assert.equal(JSON.parse(response.body).error.code, "RULE_SOP_NOT_FOUND")
})

test("Rule&SOP API는 DB 오류의 내부 정보를 노출하지 않는다", async () => {
  const repository = {
    async listDocuments() {
      throw Object.assign(new Error("sensitive database detail"), { sqlState: "HY000", errno: 1001 })
    },
  }
  const response = await callApi(repository, { headers: { "x-quality-hub-user-id": "quality.kim" } })

  assert.equal(response.statusCode, 503)
  assert.deepEqual(JSON.parse(response.body), {
    error: { code: "DB_FAILED", message: "Rule&SOP DB 요청을 처리하지 못했습니다." },
  })
  assert.doesNotMatch(response.body, /sensitive|HY000|1001/)
})
