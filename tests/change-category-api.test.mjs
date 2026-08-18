import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"

import { createChangeCategoryApi } from "../server/changeCategoryApi.mjs"

async function callApi(repository, { method = "GET", url = "/api/rule-category", body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = { host: "localhost", "x-quality-hub-user-id": "quality.kim", ...headers }
  const response = { statusCode: 0, headers: {}, body: Buffer.alloc(0) }
  const res = {
    writeHead(statusCode, nextHeaders) { response.statusCode = statusCode; response.headers = nextHeaders },
    end(value = Buffer.alloc(0)) { response.body = Buffer.isBuffer(value) ? value : Buffer.from(value) },
  }
  const handled = await createChangeCategoryApi({ repository, logger: { error() {} } }).handle(req, res)
  return { ...response, handled }
}

test("Category 최신 자료를 조회하고 사용자 ID로 교체한다", async () => {
  const category = { sheet: { rows: [{ cells: [{ text: "내용", rowSpan: 1, colSpan: 1, style: {} }] }], columnWidths: [] }, fileName: null, fileSize: null, updatedAt: "2026-08-18T08:00:00.000Z" }
  let received
  const repository = {
    async getCategory() { return category },
    async replaceCategory(input) { received = input; return category },
  }
  const getResponse = await callApi(repository, {})
  assert.equal(getResponse.statusCode, 200)
  assert.deepEqual(JSON.parse(getResponse.body).category, category)

  const putResponse = await callApi(repository, { method: "PUT", body: { sheet: category.sheet, file: null } })
  assert.equal(putResponse.statusCode, 200)
  assert.equal(received.userId, "quality.kim")
})

test("원본 XLSX를 안전한 다운로드 헤더와 함께 반환한다", async () => {
  const repository = {
    async getSourceFile() {
      return { name: "변승위 분류.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data: Buffer.from("PK12") }
    },
  }
  const response = await callApi(repository, { url: "/api/rule-category/source" })
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.toString(), "PK12")
  assert.match(response.headers["Content-Disposition"], /filename\*=UTF-8''/)
  assert.doesNotMatch(response.headers["Content-Disposition"].split("; filename*=")[0], /[^\x20-\x7e]/)
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff")
})

test("사용자 식별값, 파일 없음과 허용 메서드를 검증한다", async () => {
  const repository = { async getCategory() { return null }, async getSourceFile() { return null } }
  const unauthorized = await callApi(repository, { headers: { "x-quality-hub-user-id": "" } })
  assert.equal(unauthorized.statusCode, 401)
  assert.equal(JSON.parse(unauthorized.body).error.code, "USER_ID_REQUIRED")

  const missing = await callApi(repository, { url: "/api/rule-category/source" })
  assert.equal(missing.statusCode, 404)
  assert.equal(JSON.parse(missing.body).error.code, "SOURCE_FILE_NOT_FOUND")

  const disallowed = await callApi(repository, { method: "DELETE" })
  assert.equal(disallowed.statusCode, 405)
  assert.equal(disallowed.headers.Allow, "GET, PUT")
})

test("DB 오류 상세를 응답에 노출하지 않는다", async () => {
  const repository = { async getCategory() { throw Object.assign(new Error("sensitive"), { sqlState: "HY000", errno: 1001 }) } }
  const response = await callApi(repository, {})
  assert.equal(response.statusCode, 503)
  assert.deepEqual(JSON.parse(response.body), { error: { code: "DB_FAILED", message: "변승위 Category DB 요청을 처리하지 못했습니다." } })
  assert.doesNotMatch(response.body.toString(), /sensitive|HY000|1001/)
})
