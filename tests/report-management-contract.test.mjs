import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")
const requirements = await readFile(new URL("../docs/QUALITY_PORTAL_REQUIREMENTS.md", import.meta.url), "utf8")
const repository = await readFile(new URL("../server/reportRepository.mjs", import.meta.url), "utf8")
const api = await readFile(new URL("../server/reportApi.mjs", import.meta.url), "utf8")

test("Report는 Rule&SOP와 같은 관리자 전용 등록 흐름을 제공한다", () => {
  assert.match(html, /data-can-manage-reports="true"/)
  assert.match(html, /class="report-create-card report-admin-only"[^>]*data-report-create-open/)
  assert.ok(html.indexOf("data-report-create-open") > html.lastIndexOf("data-report-card data-report-category"))
  assert.match(styles, /body:not\(\.report-manager\) \.report-admin-only/)
  assert.match(script, /let canManageReports = prototype\?\.dataset\.canManageReports === "true"/)
  assert.match(script, /openReportEditor\("create", null, createButton\)/)
})

test("Report 수정과 실제 삭제는 활성 버튼과 DB API로 연결된다", () => {
  const viewerActions = html.match(/<div class="report-viewer-actions">([\s\S]*?)<\/div>/)?.[1] ?? ""
  assert.match(viewerActions, /data-report-delete-open[^>]*>[\s\S]*삭제<\/button>/)
  assert.match(viewerActions, /data-report-edit-open[^>]*>[\s\S]*수정<\/button>/)
  assert.doesNotMatch(viewerActions, /disabled/)
  assert.match(html, /data-report-delete-dialog/)
  assert.match(html, /report_reg 데이터가 즉시 삭제되며 복구할 수 없습니다/)
  assert.match(script, /openReportEditor\("edit", activeReportCard/)
  assert.match(script, /method: isEdit \? "PATCH" : "POST"/)
  assert.match(script, /requestReportApi\(\{ method: "DELETE" \}, reportId\)/)
  assert.match(repository, /UPDATE report_reg/)
  assert.match(repository, /DELETE FROM report_reg/)
  assert.match(repository, /LIMIT 1/)
  assert.doesNotMatch(html, /data-report-(?:disable|status|visibility|permission)/)
})

test("Report 조회와 신규 등록은 report_reg 컬럼에 직접 대응한다", () => {
  assert.match(html, /data-report-editor-name/)
  assert.match(html, /data-report-editor-description/)
  assert.match(html, /data-report-editor-category/)
  assert.match(html, /type="url"[^>]*data-report-editor-url/)
  assert.match(repository, /FROM report_reg/)
  assert.match(repository, /report_name AS reportName/)
  assert.match(repository, /report_url AS reportUrl/)
  assert.match(repository, /INSERT INTO report_reg/)
  assert.match(repository, /user_id,[\s\S]*reg_time[\s\S]*CURRENT_TIMESTAMP/)
  assert.match(api, /const API_PATH = "\/api\/reports"/)
  assert.match(script, /const path = reportId \? `\/api\/reports\/\$\{encodeURIComponent\(reportId\)\}` : "\/api\/reports"/)
  assert.match(script, /const withIdentityHeader = \(headers = \{\}\) => isSsoMode/)
  assert.match(script, /"x-quality-hub-user-id": getCurrentUser\(\)\.userId/)
  assert.match(requirements, /`report_reg`/)
})

test("DB Report 카드에는 여러 시각화가 무작위 순서로 중복 없이 우선 배정된다", () => {
  assert.match(script, /const REPORT_CARD_VISUALS = \["line", "bars", "donut"/)
  assert.match(script, /const randomIndex = Math\.floor\(Math\.random\(\) \* \(index \+ 1\)\)/)
  assert.match(script, /const visuals = createReportVisualSequence\(reports\.length\)/)
  assert.match(script, /applyReportCardVisual\(card, visuals\[index\]\)/)
  assert.match(script, /preview\.className = `report-card-preview is-\$\{visual\}`/)
})

test("DB 카테고리와 Report 카드가 동적으로 구성되고 Spotfire 원본 URL을 표시한다", () => {
  assert.match(script, /const renderReportCatalog = \(reports\)/)
  assert.match(script, /new Set\(reports\.map\(\(report\) => report\.category/)
  assert.match(script, /card\.dataset\.reportTitle = report\.reportName/)
  assert.match(script, /card\.dataset\.reportDescription = report\.description/)
  assert.match(script, /card\.dataset\.reportUrl = report\.reportUrl/)
  assert.match(html, /data-report-spotfire-frame/)
  assert.match(script, /reportSpotfireFrame\.src = reportUrl/)
  assert.match(styles, /\.spotfire-embed-frame/)
  assert.match(styles, /\.spotfire-embed-placeholder\[hidden\]\s*\{\s*display: none;/)
})

test("Report UI는 데이터 원천 표시를 숨기고 1920px에서 뷰어 좌우 여백을 절반 수준으로 줄인다", () => {
  assert.doesNotMatch(html, /data-report-viewer-updated/)
  assert.doesNotMatch(script, /data-report-viewer-updated/)
  assert.doesNotMatch(html, /data-report-source-state|<small>데이터 원천<\/small>/)
  assert.doesNotMatch(script, /reportSourceState/)
  assert.match(styles, /\.report-viewer-content \{[\s\S]*width: min\(100%, 1710px\);[\s\S]*padding: 29px 17px 50px;/)
})

test("포털 권한 설정 없이 Spotfire 자체 조회 권한을 적용한다", () => {
  assert.match(html, /포털 공개 범위는 별도로 설정하지 않습니다\./)
  assert.match(html, /조회 가능 여부는 Spotfire 자체 권한을 그대로 따릅니다\./)
  assert.match(requirements, /포털에서 Report별 공개 범위나 조회 권한을 추가로 설정하지 않고/)
  assert.match(requirements, /별도의 사용 중지 상태는 두지 않음/)
})
