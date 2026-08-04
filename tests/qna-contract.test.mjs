import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { filterPosts, initialNotifications, initialPosts, STATUS } from "../prototype/src/qna/data.js"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

test("기존 Quality Hub 안에 Q&A React 작업 화면 진입점을 제공한다", () => {
  assert.match(html, /data-qna-mode="closed"/)
  assert.match(html, /data-qna-open/)
  assert.match(html, /data-qna-notifications/)
  assert.match(html, /id="qna-root"/)
  assert.match(script, /const setQnaMode/)
  assert.match(script, /qualityhub:qna-view/)
})

test("정적 실행 경로도 React Q&A를 빌드한 뒤 제공한다", () => {
  assert.match(packageJson.scripts["start:static"], /npm run build/)
  assert.match(packageJson.scripts["start:static"], /node server\.mjs/)
})

test("Q&A 목업 데이터가 합의한 상태와 알림 구조를 제공한다", () => {
  assert.deepEqual(Object.keys(STATUS), ["waiting", "active", "completed"])
  assert.ok(initialPosts.length >= 8)
  assert.ok(initialNotifications.some((notification) => !notification.read))
  initialPosts.forEach((post) => {
    assert.ok(post.process)
    assert.ok(post.department)
    assert.ok(post.type)
    assert.ok(Array.isArray(post.tags))
    assert.ok(Array.isArray(post.messages))
  })
})

test("통합 목록 검색과 공정·부서·유형·상태 필터를 함께 적용한다", () => {
  const result = filterPosts(initialPosts, {
    search: "적용시점",
    status: "active",
    process: "식각",
    department: "공정기술",
    type: "기준 문의",
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].id, "Q-2026-084")
})
