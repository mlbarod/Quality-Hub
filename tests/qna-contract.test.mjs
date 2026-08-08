import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { filterPosts, initialNotifications, initialPosts, normalizeQnaPosts, STATUS } from "../prototype/src/qna/data.js"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const qnaEntry = await readFile(new URL("../prototype/src/main.jsx", import.meta.url), "utf8")
const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")
const qnaStyles = await readFile(new URL("../prototype/src/qna.css", import.meta.url), "utf8")
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

test("기존 Quality Hub 안에 Q&A React 작업 화면 진입점을 제공한다", () => {
  assert.match(html, /data-qna-mode="closed"/)
  assert.match(html, /data-qna-open/)
  assert.match(html, /data-qna-notifications/)
  assert.match(html, /id="qna-root"/)
  assert.match(script, /const setQnaMode/)
  assert.match(script, /qualityhub:qna-view/)
  assert.match(qnaEntry, /function loadQnaModules\(\)/)
  assert.match(qnaEntry, /button\.addEventListener\("pointerenter", prepareQna/)
  assert.match(qnaEntry, /import\("@\/qna\.css"\)/)
  assert.doesNotMatch(qnaEntry, /^import "@\/qna\.css"/m)
  assert.doesNotMatch(qnaEntry, /scheduleQnaWarmup|requestIdleCallback/)
  assert.match(html, /class="qna-boot-loading" role="status"/)
  assert.match(styles, /\.qna-workspace \{[\s\S]*visibility: hidden;/)
  assert.match(styles, /\.prototype\[data-qna-mode="open"\] \.qna-workspace/)
  assert.match(qnaStyles, /\.qna-boot-spinner \{[\s\S]*animation: qna-boot-spin/)
})

test("정적 실행 경로도 React Q&A를 빌드한 뒤 제공한다", () => {
  assert.match(packageJson.scripts["start:static"], /npm run build/)
  assert.match(packageJson.scripts["start:static"], /node server\.mjs/)
})

test("Q&A 작업 화면은 공통 상단 메뉴와 드롭다운보다 아래 계층에 표시된다", () => {
  const qnaWorkspaceZIndex = Number(styles.match(/\.qna-workspace \{[\s\S]*?z-index: (\d+);/)?.[1])
  const globalHeaderZIndex = Number(styles.match(/\.global-header \{[\s\S]*?z-index: (\d+);/)?.[1])

  assert.ok(Number.isFinite(qnaWorkspaceZIndex))
  assert.ok(Number.isFinite(globalHeaderZIndex))
  assert.ok(qnaWorkspaceZIndex < globalHeaderZIndex)
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
    assert.notEqual(post.messages[0]?.role, "질문자")
  })
})

test("질문 등록 시 생성했던 중복 메시지만 기존 로컬 데이터에서 제거한다", () => {
  const [normalized] = normalizeQnaPosts([{
    id: "Q-LEGACY",
    messages: [
      { id: "question-copy", role: "질문자", body: "질문 본문 복제" },
      { id: "answer", role: "관리자", body: "별도 답변" },
      { id: "follow-up", role: "질문자", body: "별도 추가 댓글" },
    ],
  }])

  assert.deepEqual(normalized.messages.map((message) => message.id), ["answer", "follow-up"])
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
