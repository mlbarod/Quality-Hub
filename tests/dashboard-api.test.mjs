import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"

import { createDashboardApi } from "../server/dashboardApi.mjs"

async function callApi(repository, { method = "GET", headers = {}, url = "/api/dashboard" } = {}) {
  const api = createDashboardApi({ repository, logger: { error() {} } })
  const req = Readable.from([])
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
    end(value = "") { this.body += value },
  }
  const handled = await api.handle(req, response)
  return { handled, response }
}

test("Dashboard API는 DB의 Spotfire URL을 반환한다", async () => {
  const url = "https://spotfire.internal/dashboard/quality"
  const { handled, response } = await callApi({ async getDashboard() { return { url } } }, {
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })

  assert.equal(handled, true)
  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), { dashboard: { url } })
  assert.equal(response.headers["cache-control"], "no-store")
})

test("Dashboard API는 빈 테이블과 사용자 식별 오류를 구분한다", async () => {
  const repository = { async getDashboard() { return null } }
  const empty = await callApi(repository, { headers: { "x-quality-hub-user-id": "quality.kim" } })
  assert.equal(empty.response.statusCode, 200)
  assert.deepEqual(JSON.parse(empty.response.body), { dashboard: null })

  const unauthenticated = await callApi(repository)
  assert.equal(unauthenticated.response.statusCode, 401)
  assert.equal(JSON.parse(unauthenticated.response.body).error.code, "USER_ID_REQUIRED")
})

test("Dashboard API는 GET 이외 메서드를 거절하고 다른 경로는 처리하지 않는다", async () => {
  const repository = { async getDashboard() { return null } }
  const unsupported = await callApi(repository, {
    method: "POST",
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })
  assert.equal(unsupported.response.statusCode, 405)
  assert.equal(unsupported.response.headers.allow, "GET")

  const other = await callApi(repository, {
    url: "/api/dashboard/other",
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })
  assert.equal(other.handled, false)
})

test("Dashboard API는 DB 오류 세부 내용을 숨긴다", async () => {
  const repository = {
    async getDashboard() {
      const error = new Error("secret database detail")
      error.sqlState = "42S02"
      throw error
    },
  }
  const { response } = await callApi(repository, {
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })

  assert.equal(response.statusCode, 503)
  assert.equal(JSON.parse(response.body).error.code, "DB_FAILED")
  assert.doesNotMatch(response.body, /secret database detail/)
})
