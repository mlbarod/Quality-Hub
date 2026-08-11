import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")
const qnaCss = await readFile(new URL("../prototype/src/qna.css", import.meta.url), "utf8")
const qnaApp = await readFile(new URL("../prototype/src/qna/QnaApp.jsx", import.meta.url), "utf8")

test("Quality Hub 브랜드가 새로고침 없이 열린 업무 화면을 닫고 App 홈으로 돌아간다", () => {
  assert.match(html, /class="brand"[^>]*data-home-refresh/)
  assert.match(script, /querySelectorAll\("\[data-home-refresh\]"\)/)
  assert.match(script, /const openHome = \(/)
  assert.match(script, /setReportMode\("closed", \{ announce: false, focus: false, restoreAgent: false \}\)[\s\S]*setRuleMode\("closed", \{ announce: false, focus: false, restoreAgent: false \}\)[\s\S]*setQnaMode\("closed", \{ announce: false, focus: false, restoreAgent: false \}\)[\s\S]*setDashboardMode\("home", \{ announce: false, focus: false \}\)/)
  assert.doesNotMatch(script, /window\.location\.reload\(\)/)
})

test("품질 업무 메뉴에서 각종 Report 조회로 진입한다", () => {
  const qualityMenu = html.match(/<div class="top-nav-menu">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? ""
  assert.match(qualityMenu, /data-report-open/)
  assert.match(qualityMenu, /<strong>각종 Report 조회<\/strong>/)
})

test("스카이 톤 홈에서 정위치로 분산 배치한 네 개의 App과 중앙 품질 Agent를 제공한다", () => {
  const orbit = html.match(/<div class="app-orbit"[\s\S]*?<\/div>\s*<\/section>/)?.[0] ?? ""
  assert.match(orbit, /orbit-app-report[^>]*data-report-open/)
  assert.match(orbit, /orbit-app-search[^>]*data-global-search-open/)
  assert.match(orbit, /orbit-app-rule[^>]*data-rule-open/)
  assert.match(orbit, /orbit-app-qna[^>]*data-qna-open/)
  assert.equal((orbit.match(/class="orbit-app /g) ?? []).length, 4)
  assert.match(orbit, /class="orbit-agent"[^>]*data-agent-open/)
  assert.equal((orbit.match(/class="connector-track"/g) ?? []).length, 4)
  assert.equal((orbit.match(/class="connector-signal /g) ?? []).length, 4)
  assert.match(html, /data-agent-mode="closed"/)
  assert.match(html, /id="quality-agent-floating-panel"[^>]*품질 Agent 플로팅 대화 패널/)
  assert.match(styles, /\.prototype\[data-layout="top"\]\[data-agent-mode="drawer"\] \.workspace \{\s*margin-right: 0;/)
  assert.match(styles, /\.agent-drawer \{[\s\S]*inset: auto 24px 24px auto;[\s\S]*border-radius: 25px;/)
  assert.match(styles, /\.agent-drawer \{[\s\S]*width: min\(468px, calc\(100vw - 48px\)\);[\s\S]*height: min\(864px, calc\(100vh - var\(--header-height\) - 48px\)\);/)
  assert.match(styles, /\.orbit-app \{[\s\S]*border-radius: 24px;/)
  assert.match(styles, /\.orbit-app \{[\s\S]*width: clamp\(278px, 22\.2vw, 336px\);[\s\S]*height: 197px;/)
  assert.match(styles, /\.orbit-agent \{[\s\S]*width: 152px;[\s\S]*height: 152px;/)
  assert.doesNotMatch(styles, /--tilt:/)
  assert.match(styles, /\.orbit-app-report \{ top: 12%; left: 4\.5%; \}/)
  assert.match(styles, /\.orbit-app-search \{ top: 17%; right: 3\.5%; \}/)
  assert.match(styles, /\.orbit-app-rule \{ bottom: 8%; left: 7\.5%; \}/)
  assert.match(styles, /\.orbit-app-qna \{ right: 5\.5%; bottom: 13%; \}/)
  assert.match(styles, /@keyframes orbit-signal-flow/)
  assert.match(styles, /\.orbit-agent:hover \.orbit-agent-rings \{ animation: agent-orbit-breathe/)
  assert.match(styles, /@media \(max-width: 1600px\) \{[\s\S]*\.orbit-app \{ width: 288px; height: 192px; \}/)
})

test("초기 홈에서 그래프를 숨기고 대시보드 버튼으로 별도 화면을 연다", () => {
  assert.match(html, /data-dashboard-mode="home"/)
  assert.match(html, /data-dashboard-open[^>]*aria-pressed="false"/)
  assert.match(html, /class="dashboard-view"[^>]*data-dashboard-view hidden aria-hidden="true"/)
  assert.doesNotMatch(html, /품질 업무 시작/)
  assert.match(script, /const setDashboardMode = \(mode,/)
  assert.match(script, /dashboardView\.hidden = !isDashboard/)
  assert.match(script, /url\.searchParams\.set\("view", "dashboard"\)/)
  assert.match(script, /querySelectorAll\("\[data-dashboard-open\]"\)/)
})

test("Report 카테고리를 FDC, SPC, VM 각 4개로 제공한다", () => {
  const filters = [...html.matchAll(/data-report-filter="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual([...new Set(filters)], ["all", "fdc", "spc", "vm"])

  const cardCategories = [...html.matchAll(/data-report-card data-report-category="([^"]+)"/g)].map((match) => match[1])
  assert.equal(cardCategories.length, 12)
  assert.deepEqual(Object.fromEntries(["fdc", "spc", "vm"].map((category) => [category, cardCategories.filter((value) => value === category).length])), {
    fdc: 4,
    spc: 4,
    vm: 4,
  })
  assert.match(html, /<strong>3<\/strong><small>카테고리<\/small>/)
  assert.match(html, /class="report-summary-card" role="group" aria-label="등록된 Report 요약"/)
})

test("질문 작성 버튼의 텍스트와 아이콘 모션은 동작 감소 설정을 따른다", () => {
  assert.match(qnaCss, /@keyframes qna-write-icon/)
  assert.match(qnaCss, /@keyframes qna-write-label/)
  assert.match(qnaCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(qnaCss, /\.qna-write-icon,[\s\S]*\.qna-write-label/)
  assert.match(qnaCss, /\.qna-scope \.qna-write-button \{[\s\S]*box-shadow: none;/)
  assert.match(qnaCss, /\.qna-scope \.qna-write-button \{[\s\S]*font-size: 19px;/)
  assert.match(qnaCss, /\.qna-scope button \{\s*font-family: inherit;/)
  assert.match(qnaCss, /button\.text-\\\[16px\\\] \{ font-size: 16px; \}/)
  assert.match(qnaCss, /\.qna-write-button \.qna-write-icon svg \{[\s\S]*width: 21px;[\s\S]*height: 21px;/)
})

test("메인 App 버튼은 original 카드 내부 UI와 카드 hover 모션·상시 연결 신호를 사용한다", () => {
  assert.match(html, /class="orbit-legacy-visual orbit-legacy-report"/)
  assert.match(html, /class="orbit-search-preview"/)
  assert.match(html, /class="orbit-legacy-visual orbit-legacy-rule"/)
  assert.match(html, /class="orbit-legacy-visual orbit-legacy-qna"/)
  assert.match(html, /각종 Report 조회[\s\S]*Report catalog/)
  assert.match(html, /변승위 Category분류/)
  assert.match(html, /검사 주기 기준 문의/)
  assert.doesNotMatch(styles, /\.orbit-mini-report/)
  assert.match(styles, /@keyframes mini-search-scan/)
  assert.match(styles, /\.orbit-app:hover \.report-screen-card \{ animation: report-screen-card-scan/)
  assert.match(styles, /\.orbit-app:hover \.rule-preview-accordion \{ animation: rule-accordion-open/)
  assert.match(styles, /\.orbit-app:hover \.message-bubble\.first \{ animation: qna-question-sequence/)
  assert.match(styles, /\.connector-signal \{[\s\S]*?animation: orbit-signal-flow 4\.6s linear infinite;[\s\S]*?\n\}/)
  assert.match(styles, /\.orbit-agent-copy small \{[^}]*font-size: 10px;/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})

test("App 상세 화면의 Main 버튼은 대시보드가 아닌 App 홈으로 돌아간다", () => {
  assert.equal((html.match(/class="report-back-button"[^>]*data-(?:report|rule|user)-close[^>]*>[\s\S]*?<\/svg>Main<\/button>/g) ?? []).length, 3)
  assert.match(qnaApp, /className="report-back-button"[\s\S]*qualityhub:qna-close[\s\S]*<ArrowLeft[^>]*\/>Main<\/Button>/)
  assert.match(script, /qualityhub:qna-close[\s\S]*openHome\(\)/)
  assert.equal((script.match(/button\.addEventListener\("click", \(\) => openHome\(\)\)/g) ?? []).length, 3)
  assert.doesNotMatch(script, /대시보드로 돌아왔습니다/)
  assert.match(styles, /\.report-page-header \{[\s\S]*min-height: 66px;/)
  assert.match(styles, /\.report-page-header > div:first-child > span \{[\s\S]*font-size: 14px;/)
  assert.match(styles, /\.report-back-button,[\s\S]*height: 40px;[\s\S]*font-size: 16px;/)
})

test("이미 닫힌 작업 화면은 다시 갱신하지 않아 App 전환 경로를 단순화한다", () => {
  assert.match(script, /const initializedModes = \{/)
  assert.match(script, /initializedModes\.agent && prototype\.dataset\.agentMode === mode/)
  assert.match(script, /initializedModes\.report && prototype\.dataset\.reportMode === mode/)
  assert.match(script, /initializedModes\.rule && prototype\.dataset\.ruleMode === mode/)
  assert.match(script, /initializedModes\.qna && prototype\.dataset\.qnaMode === mode/)
  assert.match(script, /initializedModes\.user && prototype\.dataset\.userMode === mode/)
})

test("제목 크기는 유지하고 주요 설명 문구를 Q&A 기준인 12px 이상으로 표시한다", () => {
  assert.match(styles, /--description-sm: 12px;/)
  assert.match(styles, /--description-md: 13px;/)
  assert.match(styles, /--description-lg: 14px;/)
  assert.match(styles, /\.section-heading > p,[\s\S]*font-size: var\(--description-lg\);/)
  assert.match(styles, /\.top-nav-menu small,[\s\S]*font-size: var\(--description-md\);/)
  assert.match(styles, /\.agent-citations button small,[\s\S]*font-size: var\(--description-sm\);/)
  assert.match(qnaApp, /Q&amp;A 게시판<\/h2>[\s\S]*text-\[12px\][^>]*>질문을 등록하고 담당자와 답변을 이어가세요/)
  assert.match(qnaApp, /DialogDescription[^>]*text-\[12px\][^>]*>구분·라인과 질문 정보를 선택/)
})
