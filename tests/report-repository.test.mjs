import assert from "node:assert/strict"
import test from "node:test"

import {
  createReportRepository,
  ReportNotFoundError,
  validateReportInput,
} from "../server/reportRepository.mjs"

test("report_reg 조회 결과는 안전한 행 식별에 필요한 여섯 컬럼을 저장소 내부에 반환한다", async () => {
  const calls = []
  const expected = [{
    category: "FDC",
    reportName: "설비 이상 Report",
    description: "설비 이상을 조회합니다.",
    reportUrl: "https://spotfire.internal/report/fdc",
    userId: "quality.kim",
    regTime: "2026-08-11T01:00:00.000Z",
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
  assert.match(calls[0].sql, /user_id AS userId/)
  assert.match(calls[0].sql, /reg_time AS regTime/)
})

test("Report 수정은 원래 여섯 컬럼을 NULL-safe 비교하고 한 행만 변경한다", async () => {
  const calls = []
  const repository = createReportRepository({
    pool: {
      async execute(sql, parameters) {
        calls.push({ sql, parameters })
        return [{ affectedRows: 1 }]
      },
    },
  })
  const reference = {
    category: "FDC",
    reportName: "기존 Report",
    description: "기존 설명",
    reportUrl: "https://spotfire/report/old",
    userId: "quality.kim",
    regTime: "2026-08-11T01:00:00.000Z",
  }
  const updated = await repository.updateReport(reference, {
    category: "SPC",
    reportName: "수정 Report",
    description: "수정 설명",
    reportUrl: "https://spotfire/report/new",
  })

  assert.equal(updated.reportName, "수정 Report")
  assert.match(calls[0].sql, /UPDATE report_reg/)
  assert.match(calls[0].sql, /category <=> \?/)
  assert.match(calls[0].sql, /user_id <=> \?/)
  assert.match(calls[0].sql, /reg_time <=> \?/)
  assert.match(calls[0].sql, /LIMIT 1/)
  assert.deepEqual(calls[0].parameters, [
    "SPC", "수정 Report", "수정 설명", "https://spotfire/report/new",
    "FDC", "기존 Report", "기존 설명", "https://spotfire/report/old",
    "quality.kim", "2026-08-11T01:00:00.000Z",
  ])
})

test("Report 삭제는 원래 여섯 컬럼과 LIMIT 1로 실제 한 행만 삭제한다", async () => {
  const calls = []
  const reference = {
    category: "FDC",
    reportName: "삭제 Report",
    description: null,
    reportUrl: "https://spotfire/report/delete",
    userId: "quality.kim",
    regTime: "2026-08-11T01:00:00.000Z",
  }
  const repository = createReportRepository({
    pool: {
      async execute(sql, parameters) {
        calls.push({ sql, parameters })
        return [{ affectedRows: 1 }]
      },
    },
  })

  assert.deepEqual(await repository.deleteReport(reference), { deleted: true })
  assert.match(calls[0].sql, /DELETE FROM report_reg/)
  assert.match(calls[0].sql, /description <=> \?/)
  assert.match(calls[0].sql, /LIMIT 1/)
  assert.deepEqual(calls[0].parameters, [
    "FDC", "삭제 Report", null, "https://spotfire/report/delete", "quality.kim", "2026-08-11T01:00:00.000Z",
  ])
})

test("동시에 변경되거나 삭제된 Report는 not found로 처리한다", async () => {
  const repository = createReportRepository({
    pool: { async execute() { return [{ affectedRows: 0 }] } },
  })
  const reference = {
    category: "FDC",
    reportName: "Report",
    description: "기존 설명",
    reportUrl: "https://spotfire/report",
    userId: "quality.kim",
    regTime: null,
  }
  await assert.rejects(
    repository.updateReport(reference, { ...reference, description: "수정 설명" }),
    ReportNotFoundError,
  )
  await assert.rejects(repository.deleteReport(reference), ReportNotFoundError)
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
