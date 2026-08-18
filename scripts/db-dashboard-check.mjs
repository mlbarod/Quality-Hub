import { createDashboardRepository } from "../server/dashboardRepository.mjs"

const repository = createDashboardRepository()

try {
  const dashboard = await repository.getDashboard()
  let protocol = null
  try {
    protocol = dashboard?.url ? new URL(dashboard.url).protocol : null
  } catch {
    protocol = "invalid"
  }
  console.log(JSON.stringify({
    table: "dashboard_report",
    hasDashboardUrl: typeof dashboard?.url === "string" && dashboard.url.length > 0,
    urlProtocol: protocol,
  }, null, 2))
} finally {
  await repository.close()
}
