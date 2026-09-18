import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"
import { createClickedHistoryApi } from "../server/clickedHistoryApi.mjs"
import { CLICK_CATEGORIES, createClickedHistoryRepository, validateClickedHistory } from "../server/clickedHistoryRepository.mjs"

async function call({ body = { category: "Rule&SOP" }, raw, method = "POST", userId = "visitor", auth, repository, url = "/api/clicked-history" } = {}) {
  const req = Readable.from([Buffer.from(raw ?? JSON.stringify(body))])
  Object.assign(req, { method, url, headers: { "x-quality-hub-user-id": userId }, auth })
  const response = {}
  const saved = []
  const api = createClickedHistoryApi({ repository: repository ?? { recordClick: async (entry) => saved.push(entry) }, logger: { error() {} } })
  response.handled = await api.handle(req, {
    writeHead(status, headers) { Object.assign(response, { status, headers }) },
    end(body) { response.body = body },
  })
  return { ...response, saved }
}

test("첫 콘텐츠는 진입 NULL 행을 갱신하고 이후 콘텐츠는 새 행에 기록한다", async () => {
  const calls = []
  const entryDate = "2026-09-18 09:00:00"
  const pool = {
    async getConnection() {
      return {
        async execute(query, values) {
          calls.push([query, values])
          return query.sql.startsWith("SELECT") ? [[{ entryDate }]] : [{ affectedRows: 1 }]
        },
        release() {},
      }
    },
    async execute(query, values) { calls.push([query, values]); return [{ affectedRows: 1 }] },
  }
  const repo = createClickedHistoryRepository({ pool })
  for (const category of CLICK_CATEGORIES) {
    const entry = await repo.recordClick({ category, userId: "visitor" })
    assert.deepEqual(entry, { entryDate })
    assert.match(calls.at(-1)[0].sql, /VALUES \(\?, NULL, \?, \?\)/)
    assert.deepEqual(calls.at(-1)[1], [category, entryDate, "visitor"])
    if (category === "품질 Agent") continue
    await repo.recordClick({ category, contents: "첫 제목", userId: "visitor", entryDate })
    assert.match(calls.at(-1)[0].sql, /UPDATE clicked_history SET contents = \?, update_date = CURRENT_TIMESTAMP WHERE category = \? AND contents IS NULL AND update_date = \? AND knox_id = \? LIMIT 1/)
    assert.deepEqual(calls.at(-1)[1], ["첫 제목", category, entryDate, "visitor"])
    await repo.recordClick({ category, contents: "다음 제목 ' ?", userId: "visitor" })
    assert.match(calls.at(-1)[0].sql, /INSERT INTO clicked_history/)
    assert.deepEqual(calls.at(-1)[1], [category, "다음 제목 ' ?", "visitor"])
  }
})

test("진입 NULL 행이 없으면 콘텐츠를 새 행에 보존한다", async () => {
  const calls = []
  const repo = createClickedHistoryRepository({ pool: { execute: async (query, values) => { calls.push([query, values]); return [{ affectedRows: 0 }] } } })
  await repo.recordClick({ category: "Rule&SOP", contents: "문서", userId: "visitor", entryDate: "2026-09-18 09:00:00" })
  assert.equal(calls.length, 2)
  assert.match(calls[0][0].sql, /^UPDATE/)
  assert.match(calls[1][0].sql, /^INSERT/)
})

test("진입 저장 응답은 DB 시각을 반환하고 첫 클릭의 진입 시각을 전달한다", async () => {
  const entryDate = "2026-09-18 09:00:00"
  const entry = await call({ repository: { recordClick: async () => ({ entryDate }) } })
  assert.equal(entry.status, 201)
  assert.deepEqual(JSON.parse(entry.body), { entryDate })
  const content = await call({ body: { category: "Rule&SOP", contents: "문서", entryDate } })
  assert.deepEqual(content.saved, [{ category: "Rule&SOP", contents: "문서", userId: "visitor", entryDate }])
  assert.equal((await call({ body: { category: "Rule&SOP", contents: "문서", entryDate: "invalid" } })).status, 400)
})

test("100자 제목 한도를 유니코드 문자 단위로 지키며 ID는 잘라 저장하지 않는다", () => {
  const value = validateClickedHistory({ category: "품질 VOE", contents: "😀".repeat(101), userId: " visitor " })
  assert.equal(value.contents, "😀".repeat(100))
  assert.equal(value.userId, "visitor")
  assert.throws(() => validateClickedHistory({ category: "품질 VOE", userId: "a".repeat(21) }), TypeError)
  assert.throws(() => validateClickedHistory({ category: "알 수 없음", userId: "visitor" }), TypeError)
  assert.equal(validateClickedHistory({ category: "Rule&SOP", contents: " ", userId: "visitor" }).contents, null)
})

test("SSO 사용자 ID가 헤더와 본문의 위조 ID 및 날짜보다 우선한다", async () => {
  const result = await call({ auth: { userId: "sso.user" }, userId: "forged", body: { category: "Rule&SOP", contents: "변승위 category 분류", knox_id: "forged", userId: "forged", update_date: "2000-01-01" } })
  assert.equal(result.status, 204)
  assert.deepEqual(result.saved, [{ category: "Rule&SOP", contents: "변승위 category 분류", userId: "sso.user" }])
})

test("잘못된 요청·누락 ID·과도한 본문은 DB에 쓰지 않는다", async () => {
  for (const [options, expected] of [
    [{ userId: "" }, 401], [{ userId: "a".repeat(21) }, 401],
    [{ body: { category: "unknown" } }, 400], [{ raw: "null" }, 400],
    [{ raw: "[]" }, 400], [{ raw: "{" }, 400],
    [{ body: { category: "Rule&SOP", contents: {} } }, 400],
    [{ raw: "a".repeat(4097) }, 413], [{ method: "GET" }, 405],
  ]) {
    const result = await call(options)
    assert.equal(result.status, expected)
    assert.equal(result.saved.length, 0)
  }
  assert.equal((await call({ url: "/api/other" })).handled, false)
})

test("DB 장애를 성공으로 응답하지 않고 민감한 오류 상세를 숨긴다", async () => {
  const result = await call({ repository: { recordClick: async () => { throw new Error("private db details") } } })
  assert.equal(result.status, 503)
  assert.doesNotMatch(result.body, /private/)
})

test("API는 첫 클릭 때 저장소를 만들고 소유한 연결만 종료한다", async () => {
  let created = 0
  let closed = 0
  const api = createClickedHistoryApi({ repositoryFactory: () => { created++; return { recordClick: async () => {}, close: async () => { closed++ } } } })
  assert.equal(created, 0)
  for (let i = 0; i < 2; i++) {
    const req = Readable.from([Buffer.from('{"category":"품질 Agent"}')])
    Object.assign(req, { method: "POST", url: "/api/clicked-history", headers: { "x-quality-hub-user-id": "visitor" } })
    await api.handle(req, { writeHead() {}, end() {} })
  }
  await api.close()
  assert.equal(created, 1)
  assert.equal(closed, 1)
})
