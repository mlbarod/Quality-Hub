import assert from "node:assert/strict"
import test from "node:test"

import { createDashboardRepository } from "../server/dashboardRepository.mjs"

test("dashboard_report의 url 컬럼 한 건을 그대로 반환한다", async () => {
  const calls = []
  const expectedUrl = "https://spotfire.internal/dashboard/quality?view=original"
  const repository = createDashboardRepository({
    pool: {
      async execute(sql, parameters) {
        calls.push({ sql, parameters })
        return [[{ url: expectedUrl }]]
      },
    },
  })

  assert.deepEqual(await repository.getDashboard(), { url: expectedUrl })
  assert.match(calls[0].sql, /SELECT url/)
  assert.match(calls[0].sql, /FROM dashboard_report/)
  assert.match(calls[0].sql, /LIMIT 1/)
  assert.equal(calls[0].parameters, undefined)
})

test("dashboard_report가 비어 있으면 null을 반환한다", async () => {
  const repository = createDashboardRepository({
    pool: { async execute() { return [[]] } },
  })

  assert.equal(await repository.getDashboard(), null)
})
