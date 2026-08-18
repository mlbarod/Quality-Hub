import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"

import { createChangeCategoryApi } from "../server/changeCategoryApi.mjs"

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const image = { name: "change-category.png", type: "image/png", width: 1280, height: 600, dataBase64: png.toString("base64") }

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

test("Category 그림 메타데이터를 조회하고 사용자 ID로 교체한다", async () => {
  const category = { imageName: image.name, imageType: image.type, imageSize: png.length, imageWidth: 1280, imageHeight: 600, updatedAt: "2026-08-18T08:00:00.000Z" }
  let received
  const repository = {
    async getCategory() { return category },
    async replaceCategory(input) { received = input; return category },
  }
  const getResponse = await callApi(repository)
  assert.equal(getResponse.statusCode, 200)
  assert.deepEqual(JSON.parse(getResponse.body).category, category)

  const putResponse = await callApi(repository, { method: "PUT", body: { image } })
  assert.equal(putResponse.statusCode, 200)
  assert.equal(received.userId, "quality.kim")
  assert.deepEqual(received.image, image)
})

test("저장된 그림을 안전한 이미지 응답으로 반환한다", async () => {
  const repository = { async getImage() { return { type: "image/png", data: png } } }
  const response = await callApi(repository, { url: "/api/rule-category/image" })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body, png)
  assert.equal(response.headers["Content-Type"], "image/png")
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff")
  assert.match(response.headers["Content-Security-Policy"], /sandbox/)
})

test("사용자 식별값, 그림 없음과 허용 메서드를 검증한다", async () => {
  const repository = { async getCategory() { return null }, async getImage() { return null } }
  const unauthorized = await callApi(repository, { headers: { "x-quality-hub-user-id": "" } })
  assert.equal(unauthorized.statusCode, 401)
  assert.equal(JSON.parse(unauthorized.body).error.code, "USER_ID_REQUIRED")

  const missing = await callApi(repository, { url: "/api/rule-category/image" })
  assert.equal(missing.statusCode, 404)
  assert.equal(JSON.parse(missing.body).error.code, "IMAGE_NOT_FOUND")

  const disallowed = await callApi(repository, { method: "DELETE" })
  assert.equal(disallowed.statusCode, 405)
  assert.equal(disallowed.headers.Allow, "GET, PUT")
})

test("DB 오류 상세를 응답에 노출하지 않는다", async () => {
  const repository = { async getCategory() { throw Object.assign(new Error("sensitive"), { sqlState: "HY000", errno: 1001 }) } }
  const response = await callApi(repository)
  assert.equal(response.statusCode, 503)
  assert.deepEqual(JSON.parse(response.body), { error: { code: "DB_FAILED", message: "변승위 Category DB 요청을 처리하지 못했습니다." } })
  assert.doesNotMatch(response.body.toString(), /sensitive|HY000|1001/)
})
