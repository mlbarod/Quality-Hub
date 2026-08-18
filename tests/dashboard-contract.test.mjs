import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")
const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8")

test("대시보드는 dashboard_report URL을 Spotfire 원본 iframe에 직접 사용한다", () => {
  assert.match(html, /data-dashboard-spotfire-frame/)
  assert.match(html, /Spotfire에서 제공하는 대시보드 원본 화면을 그대로 표시합니다\./)
  assert.doesNotMatch(html, /UI 검토용 예시 데이터/)
  assert.match(script, /fetch\("\/api\/dashboard"/)
  assert.match(script, /const nextUrl = payload\.dashboard\?\.url/)
  assert.match(script, /dashboardSpotfireFrame\.src = nextUrl/)
  assert.match(script, /window\.open\(dashboardUrl, "_blank", "noopener,noreferrer"\)/)
  assert.match(server, /createDashboardApi/)
  assert.match(server, /dashboardApi\.handle/)
})

test("대시보드는 로딩·빈 값·오류 재시도 상태를 제공한다", () => {
  assert.match(html, /data-dashboard-retry/)
  assert.match(script, /setDashboardState\("loading"\)/)
  assert.match(script, /setDashboardState\("empty"\)/)
  assert.match(script, /setDashboardState\("error"/)
  assert.match(script, /loadDashboard\(\{ force: true \}\)/)
})

test("대시보드 Spotfire 영역은 Report 뷰어보다 약 10퍼센트 넓다", () => {
  assert.match(styles, /\.report-viewer-content \{[\s\S]*width: min\(100%, 1710px\);/)
  assert.match(styles, /\.dashboard-spotfire-shell \{[\s\S]*width: min\(calc\(100vw - 40px\), 1881px\);/)
  assert.equal(1881 / 1710, 1.1)
})
