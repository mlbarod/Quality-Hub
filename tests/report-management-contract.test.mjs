import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")
const requirements = await readFile(new URL("../docs/QUALITY_PORTAL_REQUIREMENTS.md", import.meta.url), "utf8")
const phase1Memo = await readFile(new URL("../docs/PHASE1_REMAINING_TASKS.md", import.meta.url), "utf8")

test("Report는 Rule&SOP와 같은 관리자 전용 등록 흐름을 제공한다", () => {
  assert.match(html, /data-can-manage-reports="true"/)
  assert.match(html, /class="report-create-card report-admin-only"[^>]*data-report-create-open/)
  assert.ok(html.indexOf("data-report-create-open") > html.lastIndexOf("data-report-card data-report-category"))
  assert.match(styles, /body:not\(\.report-manager\) \.report-admin-only/)
  assert.match(script, /const canManageReports = prototype\?\.dataset\.canManageReports === "true"/)
  assert.match(script, /openReportEditor\("create", null, createButton\)/)
})

test("Report 출력 화면 우측 상단에서 수정과 삭제를 제공한다", () => {
  const viewerActions = html.match(/<div class="report-viewer-actions">([\s\S]*?)<\/div>/)?.[1] ?? ""
  assert.match(viewerActions, /data-report-delete-open/)
  assert.match(viewerActions, /data-report-edit-open/)
  assert.match(script, /openReportEditor\("edit", activeReportCard/)
  assert.match(script, /activeReportCard\.remove\(\)/)
  assert.doesNotMatch(html, /data-report-(?:disable|status|visibility|permission)/)
})

test("Report 편집 항목은 별도 DB 테이블의 이름·설명·카테고리·URL 컬럼에 대응한다", () => {
  assert.match(html, /data-report-editor-name/)
  assert.match(html, /data-report-editor-description/)
  assert.match(html, /data-report-editor-category/)
  assert.match(html, /type="url"[^>]*data-report-editor-url/)
  assert.match(script, /card\.dataset\.reportTitle = reportEditorName\.value\.trim\(\)/)
  assert.match(script, /card\.dataset\.reportDescription = reportEditorDescription\.value\.trim\(\)/)
  assert.match(script, /card\.dataset\.reportCategory = reportEditorCategory\.value/)
  assert.match(script, /card\.dataset\.reportUrl = reportEditorUrl\.value\.trim\(\)/)
  assert.match(requirements, /별도 DB 테이블의 각 컬럼 값을 참조/)
})

test("포털 권한 설정 없이 Spotfire 자체 조회 권한을 적용한다", () => {
  assert.match(html, /포털 공개 범위는 별도로 설정하지 않습니다\./)
  assert.match(html, /조회 가능 여부는 Spotfire 자체 권한을 그대로 따릅니다\./)
  assert.match(requirements, /포털에서 Report별 공개 범위나 조회 권한을 추가로 설정하지 않고/)
  assert.match(phase1Memo, /\[x\] 사용 중지 흐름 미제공 및 Spotfire 자체 조회 권한 적용 원칙/)
  assert.match(phase1Memo, /`7\. 문서 갱신 및 1단계 종료`부터/)
})
