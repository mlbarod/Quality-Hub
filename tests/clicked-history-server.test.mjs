import assert from "node:assert/strict"
import { once } from "node:events"
import test from "node:test"
import { createQualityHubServer } from "../server.mjs"
import { createClickedHistoryApi } from "../server/clickedHistoryApi.mjs"

test("실제 HTTP 경로에서 모든 허용 역할의 SSO ID를 기록하고 미인증·차단 사용자는 거부한다", async (t) => {
  let principal = { userId: "sso.visitor", displayName: "방문자", role: "general" }
  const saved = []
  const server = createQualityHubServer({
    authApi: { enabled: true, authenticate: async () => principal, handle: async () => false, close: async () => {} },
    clickedHistoryApi: createClickedHistoryApi({ repository: { recordClick: async (value) => {
      saved.push(value)
      return value.contents === null ? { entryDate: "2026-09-18 09:00:00" } : undefined
    } } }),
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(async () => {
    const closed = once(server, "close")
    server.close()
    server.closeIdleConnections()
    await closed
  })
  const url = `http://127.0.0.1:${server.address().port}/api/clicked-history`
  const post = () => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-quality-hub-user-id": "forged" }, body: JSON.stringify({ category: "통합 검색", contents: "조회 제목", knox_id: "forged" }) })
  for (const role of ["general", "admin", "master"]) {
    principal = { ...principal, role }
    assert.equal((await post()).status, 204)
    assert.deepEqual(saved.at(-1), { category: "통합 검색", contents: "조회 제목", userId: "sso.visitor" })
  }
  const entered = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "Rule&SOP" }) })
  assert.equal(entered.status, 201)
  const { entryDate } = await entered.json()
  const firstContent = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-quality-hub-user-id": "forged" }, body: JSON.stringify({ category: "Rule&SOP", contents: "첫 문서", entryDate }) })
  assert.equal(firstContent.status, 204)
  assert.deepEqual(saved.at(-1), { category: "Rule&SOP", contents: "첫 문서", entryDate, userId: "sso.visitor" })
  principal = { ...principal, role: "blocked" }
  assert.equal((await post()).status, 403)
  principal = null
  assert.equal((await post()).status, 401)
  assert.equal(saved.length, 5)
})
