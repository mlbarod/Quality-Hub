import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const requirements = await readFile(new URL("../docs/QUALITY_PORTAL_REQUIREMENTS.md", import.meta.url), "utf8")

test("관리 Rule 앱 명칭과 진입점을 Rule&SOP로 제공한다", () => {
  assert.match(html, /<strong>Rule&amp;SOP<\/strong>/)
  assert.match(html, /data-rule-open/)
  assert.match(html, /data-rule-workspace/)
  assert.doesNotMatch(html, />관리 Rule</)
})

test("변승위 Category분류를 접근 가능한 아코디언으로 제공한다", () => {
  assert.match(
    html,
    /aria-expanded="false" aria-controls="change-category-panel" data-rule-category-toggle/,
  )
  assert.match(html, /id="change-category-panel"[^>]*hidden data-rule-category-panel/)
  assert.match(script, /button\.setAttribute\("aria-expanded", String\(!isExpanded\)\)/)
})

test("rulesop의 대분류, 중분류, 소분류를 동적 필터와 카드 설명에 매핑한다", () => {
  assert.match(script, /document\.mainCategory\?\.trim\(\) \|\| "미분류"/)
  assert.match(script, /document\.subCategory\?\.trim\(\) \|\| "미분류"/)
  assert.match(script, /document\.item\?\.trim\(\) \|\| "미분류"/)
  assert.match(script, /document\.title\?\.trim\(\) \|\| "제목 없음"/)
  assert.match(script, /document\.url\?\.trim\(\) \|\| ""/)
  assert.match(script, /replaceRuleFilterOptions\("major"/)
  assert.match(script, /replaceRuleFilterOptions\("middle"/)
  assert.match(script, /replaceRuleFilterOptions\("minor"/)
  assert.match(script, /getRuleClassificationText/)
})

test("필터 결과 수, 요약과 목록 재배치 상태를 갱신한다", () => {
  assert.match(script, /data-rule-result-count/)
  assert.match(script, /data-rule-filter-summary/)
  assert.match(script, /playRuleCardArrangement/)
  assert.match(script, /prefers-reduced-motion: reduce/)
})

test("Rule&SOP 목록을 실제 API에서 읽고 오류 재시도를 제공한다", () => {
  assert.match(script, /fetch\(`\/api\/rules/)
  assert.match(script, /x-quality-hub-user-id/)
  assert.match(script, /Array\.isArray\(payload\.documents\)/)
  assert.match(html, /data-rule-retry/)
  assert.match(html, /rulesop 최신 목록/)
  assert.doesNotMatch(html, /예시 Rule 문서|v0\.1 MOCK|신규 문서 등록/)
})

test("카드를 누르면 분류와 원문 링크 팝업을 열고 개정 이력은 표시하지 않는다", () => {
  assert.match(html, /data-rule-detail-dialog/)
  assert.match(html, /data-rule-detail-major/)
  assert.match(html, /data-rule-detail-middle/)
  assert.match(html, /data-rule-detail-minor/)
  assert.match(html, /data-rule-detail-url/)
  assert.match(html, /data-rule-view/)
  assert.match(script, /openRuleDetail\(card, card\)/)
  assert.match(script, /window\.open\(url\.href, "_blank", "noopener,noreferrer"\)/)
  assert.doesNotMatch(html, /data-rule-revision-list|개정 이력/)
  assert.doesNotMatch(script, /ruleRevisionHistory|revisions\.unshift/)
})

test("관리자는 상세 팝업에서 Rule&SOP를 수정하거나 실제 삭제한다", () => {
  assert.match(html, /data-rule-edit-open[^>]*>[\s\S]*수정/)
  assert.match(html, /data-rule-delete-open[^>]*>[\s\S]*삭제/)
  assert.match(html, /data-rule-editor-dialog/)
  assert.match(html, /data-rule-delete-dialog/)
  assert.match(html, /rulesop 데이터가 즉시 삭제되며 복구할 수 없습니다/)
  assert.match(script, /method: "PATCH"/)
  assert.match(script, /method: "DELETE"/)
  assert.match(script, /canManageRuleDocuments/)
  assert.doesNotMatch(html, /data-rule-revision-input|개정 내용|숨김 버튼|>숨김</)
})

test("Rule&SOP 수정 폼은 다섯 표시 컬럼만 편집하고 개정 코멘트를 받지 않는다", () => {
  assert.match(html, /data-rule-editor-title-input/)
  assert.match(html, /data-rule-editor-major/)
  assert.match(html, /data-rule-editor-middle/)
  assert.match(html, /data-rule-editor-minor/)
  assert.match(html, /data-rule-editor-url/)
  assert.doesNotMatch(html, /개정 내용|개정 코멘트|revision-comment/)
  assert.match(script, /mainCategory: ruleEditorMajor\.value\.trim\(\)/)
  assert.match(script, /subCategory: ruleEditorMiddle\.value\.trim\(\)/)
  assert.match(script, /item: ruleEditorMinor\.value\.trim\(\)/)
})

test("현재 요구사항에 rulesop 컬럼과 표시 계약을 기록한다", () => {
  assert.match(requirements, /실제 DB `rulesop`의 `main_category`, `sub_category`, `item`, `title`, `url`, `reg_user`, `reg_date`를 조회/)
  assert.match(requirements, /각각 대분류·중분류·소분류 필터와 카드 설명에 사용/)
  assert.match(requirements, /`title`을 카드 제목으로 표시/)
  assert.match(requirements, /상세 팝업에 표시하고 조회 버튼으로 `url`을 새 창에서 열기/)
  assert.match(requirements, /MOCK 문구, 상세 팝업의 개정 이력/)
  assert.match(requirements, /실제 삭제/)
})
