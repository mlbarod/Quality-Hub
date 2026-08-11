import { createReportRepository } from "../server/reportRepository.mjs"

const repository = createReportRepository()

try {
  const reports = await repository.listReports()
  const categoryCounts = reports.reduce((counts, report) => {
    const category = report.category ?? "미분류"
    counts.set(category, (counts.get(category) ?? 0) + 1)
    return counts
  }, new Map())

  console.log(JSON.stringify({
    table: "report_reg",
    reportCount: reports.length,
    categoryCounts: Object.fromEntries(categoryCounts),
  }, null, 2))
} finally {
  await repository.close()
}
