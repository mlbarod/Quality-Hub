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

test("마스터가 유저 ID와 소속부서 기준의 관리자·일반 접근 규칙을 관리한다", () => {
  assert.match(html, /data-user-workspace/)
  assert.match(html, /data-user-open/)
  assert.match(html, /data-access-add-open/)
  assert.match(html, /data-access-add-dialog/)
  assert.match(html, /data-access-field-input/)
  assert.match(html, /data-access-match-input/)
  assert.match(html, /data-access-value-input/)
  assert.equal([...html.matchAll(/data-access-role(?:\s|>)/g)].length, 2)
  assert.match(html, /value="admin"/)
  assert.match(html, /value="general"/)
  assert.match(html, /value="user-id"/)
  assert.match(html, /value="department"/)
  assert.match(html, /value="exact"/)
  assert.match(html, /value="contains"/)
  assert.match(html, /data-access-remove/)
  assert.equal([...html.matchAll(/data-access-row(?:\s|>)/g)].length, 4)
  assert.match(script, /const setUserMode/)
  assert.match(script, /document\.querySelector\("\[data-access-field-input\]"\)/)
  assert.match(script, /document\.querySelector\("\[data-access-match-input\]"\)/)
  assert.match(script, /const updateAccessCounts/)
  assert.match(script, /accessAddForm\?\.addEventListener\("submit"/)
  assert.match(script, /row\.dataset\.accessField === accessField/)
  assert.match(script, /row\.dataset\.accessMatch === accessMatch/)
  assert.match(memo, /등록된 관리자·일반 규칙과 일치하지 않는 사용자는 포털 접근을 차단/)
  assert.match(memo, /관리자 권한을 일반 권한보다 우선 적용/)
})

test("사용자 및 권한 화면의 표와 조작 요소를 읽기 쉬운 크기로 제공한다", () => {
  assert.match(styles, /\.role-summary-card small \{[^}]*font-size: 14px;/s)
  assert.match(styles, /\.user-search input \{[^}]*font-size: 15px;/s)
  assert.match(styles, /\.admin-add-button \{[^}]*height: 48px;[^}]*font-size: 15px;/s)
  assert.match(styles, /\.user-table-header \{[^}]*min-height: 54px;[^}]*font-size: 14px;/s)
  assert.match(styles, /\.user-table-row \{[^}]*min-height: 88px;[^}]*font-size: 16px;/s)
  assert.match(styles, /\.access-role-badge \{[^}]*font-size: 14px;/s)
  assert.match(styles, /\.admin-remove-button \{[^}]*height: 44px;[^}]*font-size: 14px;/s)
  assert.match(styles, /\.admin-add-form > footer button \{[^}]*height: 46px;[^}]*font-size: 14px;/s)
})

test("품질 Agent UI 확정과 실제 연동 후속 처리를 메모에 명시한다", () => {
  assert.match(memo, /품질 Agent의 UI와 사용 흐름은 현재 안으로 완료 처리한다/)
  assert.match(memo, /품질 Agent의 실제 사내 LLM API 연동은 1단계에 포함하지 않는다/)
  assert.match(memo, /\[x\] 품질 Agent UI 설계 완료 및 실제 연동 후속 처리 명시/)
})
