import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"

import { createReportApi } from "../server/reportApi.mjs"

async function callApi(repository, { method = "GET", headers = {}, body, url = "/api/reports", api } = {}) {
  const activeApi = api ?? createReportApi({ repository, logger: { error() {} } })
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

test("Report API는 DB 목록을 반환한다", async () => {
  const reports = [{
    category: "FDC",
    reportName: "FDC Report",
    description: "설명",
    reportUrl: "https://spotfire/report",
    userId: "quality.kim",
    regTime: "2026-08-11T01:00:00.000Z",
  }]
  const repository = { async listReports() { return reports } }
  const api = createReportApi({ repository, logger: { error() {} }, uuidFactory: () => "report-1" })
  const response = await callApi(repository, {
    api,
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), { reports: [{
    reportId: "report-1",
    category: "FDC",
    reportName: "FDC Report",
    description: "설명",
    reportUrl: "https://spotfire/report",
  }] })
  assert.doesNotMatch(response.body, /quality\.kim|regTime/)
  assert.equal(response.headers["cache-control"], "no-store")
})

test("Report 수정과 삭제는 목록 조회에서 발급한 식별자로 같은 DB 행을 처리한다", async () => {
  const reference = {
    category: "FDC",
    reportName: "기존 Report",
    description: "기존 설명",
    reportUrl: "https://spotfire/report/old",
    userId: "quality.kim",
    regTime: "2026-08-11T01:00:00.000Z",
  }
  const received = []
  const repository = {
    async listReports() { return [reference] },
    async updateReport(original, body) {
      received.push({ operation: "update", original, body })
      return body
    },
    async deleteReport(original) {
      received.push({ operation: "delete", original })
      return { deleted: true }
    },
  }
  let sequence = 0
  const api = createReportApi({ repository, logger: { error() {} }, uuidFactory: () => `report-${++sequence}` })
  const headers = { "x-quality-hub-user-id": "quality.kim" }
  await callApi(repository, { api, headers })
  const updatedBody = {
    category: "SPC",
    reportName: "수정 Report",
    description: "수정 설명",
    reportUrl: "https://spotfire/report/new",
  }
  const updated = await callApi(repository, {
    api,
    method: "PATCH",
    url: "/api/reports/report-1",
    headers,
    body: updatedBody,
  })
  assert.equal(updated.statusCode, 200)
  assert.deepEqual(received[0], { operation: "update", original: reference, body: updatedBody })

  await callApi(repository, { api, headers })
  const deleted = await callApi(repository, {
    api,
    method: "DELETE",
    url: "/api/reports/report-2",
    headers,
  })
  assert.equal(deleted.statusCode, 200)
  assert.deepEqual(received[1], { operation: "delete", original: reference })
})

test("만료되거나 잘못된 Report 식별자는 404로 거절한다", async () => {
  const repository = {}
  const response = await callApi(repository, {
    method: "DELETE",
    url: "/api/reports/not-found",
    headers: { "x-quality-hub-user-id": "quality.kim" },
  })
  assert.equal(response.statusCode, 404)
  assert.equal(JSON.parse(response.body).error.code, "REPORT_NOT_FOUND")
})

test("Report 식별자는 목록을 조회한 사용자에게만 유효하다", async () => {
  const repository = {
    async listReports() {
      return [{ category: "FDC", reportName: "Report", description: "설명", reportUrl: "https://spotfire/report", userId: "owner", regTime: null }]
    },
  }
  const api = createReportApi({ repository, logger: { error() {} }, uuidFactory: () => "private-report" })
  await callApi(repository, { api, headers: { "x-quality-hub-user-id": "quality.admin" } })
  const response = await callApi(repository, {
    api,
    method: "DELETE",
    url: "/api/reports/private-report",
    headers: { "x-quality-hub-user-id": "quality.other" },
  })
  assert.equal(response.statusCode, 404)
  assert.equal(JSON.parse(response.body).error.code, "REPORT_NOT_FOUND")
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
