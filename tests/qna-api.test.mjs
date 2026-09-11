import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"

import { createQnaApi } from "../server/qnaApi.mjs"
import { QnaPermissionError } from "../server/qnaRepository.mjs"

async function callApi(repository, { method = "GET", url = "/api/qna", body, headers = {} } = {}) {
  const api = createQnaApi({ repository, logger: { error() {} } })
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = { host: "localhost", ...headers }
  const res = {
    statusCode: null,
    headers: {},
    body: "",
    writeHead(statusCode, responseHeaders) {
      this.statusCode = statusCode
      this.headers = Object.fromEntries(Object.entries(responseHeaders).map(([key, value]) => [key.toLowerCase(), String(value)]))
    },
    end(value = "") { this.body += value },
  }
  await api.handle(req, res)
  return res
}

const identity = {
  "x-quality-hub-user-id": "quality.kim",
  "x-quality-hub-user-name": encodeURIComponent("김품질"),
  "x-quality-hub-role": "master",
}

test("Q&A API는 로그인 사용자 기준 DB 스냅샷을 반환한다", async () => {
  let receivedActor
  const snapshot = { posts: [], notifications: [], history: [] }
  const response = await callApi({
    async getSnapshot(actor) {
      receivedActor = actor
      return snapshot
    },
  }, { headers: identity })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), snapshot)
  assert.deepEqual(receivedActor, { userId: "quality.kim", displayName: "김품질", role: "master" })
  assert.equal(response.headers["cache-control"], "no-store")
})

test("Q&A API는 질문·답변·알림 변경 경로를 Repository에 전달한다", async () => {
  const calls = []
  const repository = {
    async createQuestion(body, actor) { calls.push(["createQuestion", body, actor]); return { questionId: 7 } },
    async updateQuestion(questionId, body, actor) { calls.push(["updateQuestion", questionId, body, actor]); return { updated: true } },
    async createMessage(questionId, body, actor) { calls.push(["createMessage", questionId, body, actor]); return { messageId: 9 } },
    async updateMessage(questionId, messageId, body, actor) { calls.push(["updateMessage", questionId, messageId, body, actor]); return { updated: true } },
    async markNotificationsRead(body, actor) { calls.push(["notifications", body, actor]); return { updated: 1 } },
  }
  const cases = [
    ["POST", "/api/qna/questions", { title: "질문" }, 201],
    ["PATCH", "/api/qna/questions/7", { operation: "status", status: "active" }, 200],
    ["POST", "/api/qna/questions/7/messages", { bodyHtml: "<p>답변</p>" }, 201],
    ["PATCH", "/api/qna/questions/7/messages/9", { operation: "hide" }, 200],
    ["PATCH", "/api/qna/notifications", { all: true }, 200],
  ]
  for (const [method, url, body, status] of cases) {
    const response = await callApi(repository, { method, url, body, headers: identity })
    assert.equal(response.statusCode, status)
  }
  assert.deepEqual(calls.map(([name]) => name), ["createQuestion", "updateQuestion", "createMessage", "updateMessage", "notifications"])
})

test("Q&A API는 사용자 정보 누락, 권한 거부와 DB 오류를 구분해 노출한다", async () => {
  const missing = await callApi({ async getSnapshot() { return {} } })
  assert.equal(missing.statusCode, 401)
  assert.equal(JSON.parse(missing.body).error.code, "USER_REQUIRED")

  const forbidden = await callApi({ async updateQuestion() { throw new QnaPermissionError() } }, {
    method: "PATCH",
    url: "/api/qna/questions/1",
    body: { operation: "hide" },
    headers: identity,
  })
  assert.equal(forbidden.statusCode, 403)
  assert.equal(JSON.parse(forbidden.body).error.code, "QNA_FORBIDDEN")

  const failed = await callApi({ async getSnapshot() { throw Object.assign(new Error("secret"), { sqlState: "HY000", errno: 1001 }) } }, { headers: identity })
  assert.equal(failed.statusCode, 503)
  assert.deepEqual(JSON.parse(failed.body), { error: { code: "DB_FAILED", message: "품질VOE DB 요청을 처리하지 못했습니다." } })
  assert.doesNotMatch(failed.body, /secret|HY000|1001/)
})

test("메일 지연·실패는 저장 응답을 막지 않고 종료 시 진행 중 발송을 기다린다", async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const events = []
  let saved = false
  const api = createQnaApi({
    repository: { async createQuestion() { saved = true; return { questionId: 7 } } },
    logger: { error() {} },
    mailNotifier: { async notify(event) { assert.equal(saved, true); events.push(event); await gate; throw new Error('mail failure') } },
  })
  const req = Readable.from([Buffer.from('{}')])
  Object.assign(req, { method: 'POST', url: '/api/qna/questions', headers: identity })
  const res = { writeHead(status) { this.status = status }, end(body) { this.body = body } }
  await api.handle(req, res)
  assert.equal(res.status, 201)
  assert.deepEqual(JSON.parse(res.body), { questionId: 7 })
  assert.equal(events[0].eventType, 'question_created')
  let closed = false
  const closing = api.close().then(() => { closed = true })
  await Promise.resolve()
  assert.equal(closed, false)
  release()
  await closing
  assert.equal(closed, true)
})

test("저장 실패와 수정에는 메일이 없고 추가 답변 등록에만 발송한다", async () => {
  const events = []
  const api = createQnaApi({
    repository: {
      async createQuestion() { throw new Error('DB failed') },
      async createMessage() { return { messageId: 9 } },
      async updateQuestion() { return { updated: true } },
    },
    logger: { error() {} }, mailNotifier: { async notify(event) { events.push(event) } },
  })
  for (const [method, url] of [['POST', '/api/qna/questions'], ['PATCH', '/api/qna/questions/7'], ['POST', '/api/qna/questions/7/messages']]) {
    const req = Readable.from([Buffer.from('{}')])
    Object.assign(req, { method, url, headers: identity })
    await api.handle(req, { writeHead() {}, end() {} })
  }
  await api.close()
  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, 'message_created')
  assert.equal(events[0].questionId, 7)
  assert.equal(events[0].messageId, 9)
})
