import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"

import { createReportApi } from "../server/reportApi.mjs"

async function callApi(repository, { method = "GET", headers = {}, body } = {}) {
  const api = createReportApi({ repository, logger: { error() {} } })
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = "/api/reports"
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
  await api.handle(req, response)
  return response
}

test("Report API는 DB 목록을 반환한다", async () => {
  const reports = [{ category: "FDC", reportName: "FDC Report", description: "설명", reportUrl: "https://spotfire/report" }]
  const response = await callApi({ async listReports() { return reports } }, {
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), { reports })
  assert.equal(response.headers["cache-control"], "no-store")
})

test("신규 등록 시 헤더 user ID를 저장소 입력에 추가한다", async () => {
  let received
  const repository = {
    async createReport(input) {
      received = input
      return input
    },
  }
  const body = {
    category: "VM",
    reportName: "VM Report",
    description: "설명",
    reportUrl: "https://spotfire/report/vm",
  }
  const response = await callApi(repository, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-quality-hub-user-id": "quality.kim",
    },
    body,
  })

  assert.equal(response.statusCode, 201)
  assert.deepEqual(received, { ...body, userId: "quality.kim" })
})

test("Report API는 사용자 식별값과 허용 메서드를 검증한다", async () => {
  const repository = { async listReports() { return [] } }
  const unauthenticated = await callApi(repository)
  assert.equal(unauthenticated.statusCode, 401)
  assert.equal(JSON.parse(unauthenticated.body).error.code, "USER_ID_REQUIRED")

  const unsupported = await callApi(repository, {
    method: "DELETE",
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })
  assert.equal(unsupported.statusCode, 405)
  assert.equal(unsupported.headers.allow, "GET, POST")
})
