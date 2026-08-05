import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")
const qnaApp = await readFile(new URL("../prototype/src/qna/QnaApp.jsx", import.meta.url), "utf8")
const memo = await readFile(new URL("../docs/PHASE1_REMAINING_TASKS.md", import.meta.url), "utf8")
const requirements = await readFile(new URL("../docs/QUALITY_PORTAL_REQUIREMENTS.md", import.meta.url), "utf8")
const developmentPlan = await readFile(new URL("../docs/DEVELOPMENT_PLAN.md", import.meta.url), "utf8")
const completionReport = await readFile(new URL("../docs/PHASE1_COMPLETION_REPORT.md", import.meta.url), "utf8")

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

test("확정한 역할별 콘텐츠와 Q&A 권한을 요구사항에 기록한다", () => {
  assert.match(requirements, /관리 대상 콘텐츠: Report, Rule&SOP, 변승위 Category/)
  assert.match(requirements, /\| 관리 대상 콘텐츠 \| 전체 조회·등록·수정·삭제 \| 전체 조회·등록·수정·삭제 \| 전체 조회 \|/)
  assert.match(requirements, /\| Q&A 답변·댓글 \| 전체 작성·수정·삭제 \| 전체 작성, 본인 작성분 수정·삭제 \| 전체 작성, 본인 작성분 수정·삭제 \|/)
  assert.match(requirements, /답변이 등록된 질문은 작성자가 수정할 수 있지만 삭제할 수 없으며, 마스터만 삭제 가능/)
  assert.match(requirements, /이전 상태를 포함해 자유롭게 변경 가능/)
  assert.match(requirements, /마스터가 1명뿐이면 해당 계정의 권한 회수를 비활성화/)
  assert.match(requirements, /복구 가능한 숨김 처리로 수행하며, 복구는 마스터만 가능/)
  assert.match(requirements, /콘텐츠·권한·Q&A 상태의 변경 이력은 마스터만 조회 가능/)
  assert.match(memo, /### 4\. 역할별 권한 확정\s+[\s\S]*?\[x\] 마스터:/)
})

test("확정한 공통 화면 상태와 역할별 문의 대상을 문서에 기록한다", () => {
  assert.match(memo, /\[x\] 로딩:.*회전형 로딩 아이콘.*`처리 중`/)
  assert.match(memo, /\[x\] 데이터 없음:.*`데이터가 없습니다\.`/)
  assert.match(memo, /\[x\] 조회 오류와 다시 시도:.*경고 아이콘.*`다시 시도` 버튼/)
  assert.match(memo, /\[x\] 오래된 데이터와 마지막 정상 시각:.*오늘 09:40 \(목업\)/)
  assert.match(memo, /일반유저에게는.*관리자에게 문의해 주세요.*관리자에게는.*마스터에게 문의해 주세요/)
  assert.match(requirements, /데이터가 없으면 작은 비차단 팝업/)
  assert.match(requirements, /실제 연동 전 목업 시각은 목업임을 명시/)
})

test("현재 목업의 전체 사용 흐름 검수 완료와 운영 검증 경계를 기록한다", () => {
  assert.match(memo, /현재 UI 목업에 대한 사용자 검수 결과를 기준으로 완료 처리한다/)
  assert.match(memo, /실제 SSO·Spotfire·사내 데이터 연동 이후의 운영 동작은 후속 단계에서 별도로 검증한다/)
  assert.match(memo, /\[x\] 주요 기능을 별도 설명 없이 찾을 수 있는지 확인/)
  assert.match(memo, /\[x\] 화면 이동과 이전 화면 복귀 확인/)
  assert.match(memo, /\[x\] 키보드 조작과 초점 표시 확인/)
  assert.match(memo, /\[x\] 명도 대비와 상태 표현 확인/)
  assert.match(memo, /\[x\] 동작 축소 설정 확인/)
})

test("사용자 및 권한 화면의 표와 조작 요소를 읽기 쉬운 크기로 제공한다", () => {
  const reportCardTitleSize = styles.match(/\.report-card-copy strong \{[^}]*font-size: (\d+px);/s)?.[1]
  const accessTableBodySize = styles.match(/\.user-table-row \{[^}]*font-size: (\d+px);/s)?.[1]

  assert.match(styles, /\.role-summary-card small \{[^}]*font-size: 14px;/s)
  assert.match(styles, /\.user-search input \{[^}]*font-size: 15px;/s)
  assert.match(styles, /\.admin-add-button \{[^}]*height: 48px;[^}]*font-size: 15px;/s)
  assert.match(styles, /\.user-table-header \{[^}]*min-height: 54px;[^}]*font-size: 14px;/s)
  assert.equal(accessTableBodySize, reportCardTitleSize)
  assert.match(styles, /\.access-value \{[^}]*font-size: 14px;/s)
  assert.match(styles, /\.access-role-badge \{[^}]*font-size: 14px;/s)
  assert.match(styles, /\.admin-remove-button \{[^}]*height: 44px;[^}]*font-size: 14px;/s)
  assert.match(styles, /\.admin-add-form > footer button \{[^}]*height: 46px;[^}]*font-size: 14px;/s)
})

test("품질 Agent UI 확정과 실제 연동 후속 처리를 메모에 명시한다", () => {
  assert.match(memo, /품질 Agent의 UI와 사용 흐름은 현재 안으로 완료 처리한다/)
  assert.match(memo, /품질 Agent의 실제 사내 LLM API 연동은 1단계에 포함하지 않는다/)
  assert.match(memo, /\[x\] 품질 Agent UI 설계 완료 및 실제 연동 후속 처리 명시/)
})

test("1단계 완료 판정과 2단계 구현 경계를 문서와 화면에 일치시킨다", () => {
  assert.match(memo, /\[x\] 요구사항·개발 계획·UI\/UX 설계 문서와 현재 화면 대조/)
  assert.match(memo, /1단계 UI\/UX 설계를 종료한다/)
  assert.match(developmentPlan, /현재 상태:\*\* 1단계 UI\/UX 설계 완료/)
  assert.match(developmentPlan, /2단계: UI 프로토타입 구현 · 다음 단계/)
  assert.match(completionReport, /최종 판정:\*\* 완료/)
  assert.match(completionReport, /실제 인증, 권한 집행, 운영 저장/)
  assert.match(completionReport, /## 6\. 2단계 인계 항목/)
  assert.match(html, /예시 원천 상태/)
  assert.match(html, /사내 LLM · 연동 예정/)
  assert.doesNotMatch(html, /사내 LLM · 연결됨/)
})
