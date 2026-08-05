import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")
const qnaApp = await readFile(new URL("../prototype/src/qna/QnaApp.jsx", import.meta.url), "utf8")
const memo = await readFile(new URL("../docs/PHASE1_REMAINING_TASKS.md", import.meta.url), "utf8")

test("데이터 원천 관리 진입점을 제거하고 1단계 범위에 기록한다", () => {
  assert.doesNotMatch(html, /data-planned="데이터 원천"/)
  assert.doesNotMatch(html, /<strong>데이터 원천<\/strong>/)
  assert.match(memo, /\[x\] 데이터 원천 관리 메뉴와 진입점 제거/)
})

test("통합 검색 팝업에서 Report, Rule&SOP, Q&A 콘텐츠로 연결한다", () => {
  assert.match(html, /data-global-search-open/)
  assert.match(html, /<dialog[^>]*data-global-search/)
  assert.match(html, /data-search-target="report"/)
  assert.match(html, /data-search-target="rule"/)
  assert.match(html, /data-search-target="qna"/)
  assert.match(script, /const openGlobalSearch/)
  assert.match(script, /setReportMode\("viewer", \{ card \}\)/)
  assert.match(script, /setRuleMode\("open"\)/)
  assert.match(script, /setQnaMode\("open", \{ view: "detail", postId: contentId \}\)/)
  assert.match(qnaApp, /hasRequestedPost \? "detail" : "list"/)
  assert.match(styles, /\.header-search \{\s*min-width: 230px;/)
})

test("마스터가 사내 ID로 관리자 권한만 추가하거나 삭제한다", () => {
  assert.match(html, /data-user-workspace/)
  assert.match(html, /data-user-open/)
  assert.match(html, /data-admin-add-open/)
  assert.match(html, /data-admin-add-dialog/)
  assert.match(html, /data-admin-id-input/)
  assert.match(html, /data-admin-remove/)
  assert.equal([...html.matchAll(/data-admin-row(?:\s|>)/g)].length, 3)
  assert.doesNotMatch(html, /data-user-row/)
  assert.doesNotMatch(html, /data-user-role/)
  assert.match(script, /const setUserMode/)
  assert.match(script, /const updateAdminCount/)
  assert.match(script, /adminAddForm\?\.addEventListener\("submit"/)
  assert.match(script, /\^\[a-z0-9\]\[a-z0-9\._-\]\{2,39\}\$/i)
  assert.match(memo, /일반유저는 대규모 사용자이므로 권한 관리 목록과 개별 관리 대상에서 제외/)
})

test("품질 Agent UI 확정과 실제 연동 후속 처리를 메모에 명시한다", () => {
  assert.match(memo, /품질 Agent의 UI와 사용 흐름은 현재 안으로 완료 처리한다/)
  assert.match(memo, /품질 Agent의 실제 사내 LLM API 연동은 1단계에 포함하지 않는다/)
  assert.match(memo, /\[x\] 품질 Agent UI 설계 완료 및 실제 연동 후속 처리 명시/)
})
