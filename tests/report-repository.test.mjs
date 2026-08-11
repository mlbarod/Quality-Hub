import assert from "node:assert/strict"
import test from "node:test"

import {
  createReportRepository,
  validateReportInput,
} from "../server/reportRepository.mjs"

test("report_reg 조회 결과는 화면에 필요한 네 컬럼만 반환한다", async () => {
  const calls = []
  const expected = [{
    category: "FDC",
    reportName: "설비 이상 Report",
    description: "설비 이상을 조회합니다.",
    reportUrl: "https://spotfire.internal/report/fdc",
  }]
  const repository = createReportRepository({
    pool: {
      async execute(sql, parameters) {
        calls.push({ sql, parameters })
        return [expected]
      },
    },
  })

  assert.deepEqual(await repository.listReports(), expected)
  assert.match(calls[0].sql, /FROM report_reg/)
  assert.match(calls[0].sql, /report_name AS reportName/)
  assert.match(calls[0].sql, /report_url AS reportUrl/)
  assert.doesNotMatch(calls[0].sql, /user_id AS/)
  assert.doesNotMatch(calls[0].sql, /reg_time AS/)
})

test("신규 Report는 user_id와 DB 현재 시각을 함께 기록한다", async () => {
  const calls = []
  const repository = createReportRepository({
    pool: {
      async execute(sql, parameters) {
        calls.push({ sql, parameters })
        return [{ affectedRows: 1 }]
      },
    },
  })

  const report = await repository.createReport({
    category: " SPC ",
    reportName: " 공정 능력 ",
    description: " 공정 능력 추이를 조회합니다. ",
    reportUrl: " https://spotfire.internal/report/spc ",
    userId: " quality.kim ",
  })

  assert.deepEqual(report, {
    category: "SPC",
    reportName: "공정 능력",
    description: "공정 능력 추이를 조회합니다.",
    reportUrl: "https://spotfire.internal/report/spc",
  })
  assert.match(calls[0].sql, /INSERT INTO report_reg/)
  assert.match(calls[0].sql, /user_id,[\s\S]*reg_time/)
  assert.match(calls[0].sql, /CURRENT_TIMESTAMP/)
  assert.deepEqual(calls[0].parameters, [
    "SPC",
    "공정 능력",
    "공정 능력 추이를 조회합니다.",
    "https://spotfire.internal/report/spc",
    "quality.kim",
  ])
})

test("report_reg 컬럼 길이와 Spotfire URL 형식을 검증한다", () => {
  const valid = {
    category: "FDC",
    reportName: "Report",
    description: "설명",
    reportUrl: "https://spotfire.internal/report",
    userId: "quality.kim",
  }

  assert.deepEqual(validateReportInput(valid), valid)
  assert.throws(() => validateReportInput({ ...valid, category: "가".repeat(21) }), /20자/)
  assert.throws(() => validateReportInput({ ...valid, reportName: "가".repeat(51) }), /50자/)
  assert.throws(() => validateReportInput({ ...valid, description: "가".repeat(501) }), /500자/)
  assert.throws(() => validateReportInput({ ...valid, userId: "a".repeat(21) }), /20자/)
  assert.throws(() => validateReportInput({ ...valid, reportUrl: "javascript:alert(1)" }), /http 또는 https/)
})
