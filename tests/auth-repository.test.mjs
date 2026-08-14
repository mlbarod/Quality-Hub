import assert from "node:assert/strict"
import test from "node:test"

import { resolveRoleFromRecords } from "../server/authRepository.mjs"

const identity = { userId: "quality.user", department: "품질관리1팀" }

test("마스터는 접근 규칙보다 우선하며 미일치 사용자는 차단한다", () => {
  assert.equal(resolveRoleFromRecords(identity, [{ userId: "quality.user" }], []), "master")
  assert.equal(resolveRoleFromRecords(identity, [], []), "blocked")
})

test("사용자 ID 직접 일치와 부서 포함 규칙을 적용하고 관리자 권한을 우선한다", () => {
  const rules = [
    { role: "general", field: "department", matchType: "contains", matchValue: "품질" },
    { role: "admin", field: "user_id", matchType: "exact", matchValue: "quality.user" },
  ]
  assert.equal(resolveRoleFromRecords(identity, [], rules), "admin")
  assert.equal(resolveRoleFromRecords({ ...identity, userId: "QUALITY.USER" }, [], [rules[1]]), "blocked")
})
