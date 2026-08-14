import assert from "node:assert/strict"
import test from "node:test"

import {
  createRuleSopRepository,
  RuleSopNotFoundError,
  validateRuleSopFields,
} from "../server/ruleSopRepository.mjs"

test("rulesop의 일곱 컬럼을 Rule&SOP 화면 계약으로 조회한다", async () => {
  const calls = []
  const expected = [{
    mainCategory: "대분류",
    subCategory: "중분류",
    item: "소분류",
    title: "업무 표준",
    url: "https://quality.internal/rules/1",
    regUser: "quality.kim",
    regDate: "2026-08-14T01:00:00.000Z",
  }]
  const repository = createRuleSopRepository({
    pool: {
      async execute(sql, parameters) {
        calls.push({ sql, parameters })
        return [expected]
      },
    },
  })

  assert.deepEqual(await repository.listDocuments(), expected)
  assert.match(calls[0].sql, /FROM rulesop/)
  assert.match(calls[0].sql, /main_category AS mainCategory/)
  assert.match(calls[0].sql, /sub_category AS subCategory/)
  assert.match(calls[0].sql, /reg_user AS regUser/)
  assert.match(calls[0].sql, /reg_date AS regDate/)
  assert.match(calls[0].sql, /ORDER BY[\s\S]*main_category ASC[\s\S]*sub_category ASC[\s\S]*item ASC/)
})

test("rulesop 수정은 원본 일곱 컬럼이 일치하는 한 행만 변경한다", async () => {
  const calls = []
  const repository = createRuleSopRepository({
    pool: {
      async execute(sql, parameters) {
        calls.push({ sql, parameters })
        return [{ affectedRows: 1 }]
      },
    },
  })
  const reference = {
    mainCategory: "대분류",
    subCategory: "중분류",
    item: "소분류",
    title: "기존 제목",
    url: "https://quality.internal/rules/1",
    regUser: "quality.kim",
    regDate: "2026-08-14T01:00:00.000Z",
  }
  const input = {
    mainCategory: " 변경 대분류 ",
    subCategory: "변경 중분류",
    item: "변경 소분류",
    title: "변경 제목",
    url: "https://quality.internal/rules/2",
  }

  assert.deepEqual(await repository.updateDocument(reference, input), {
    ...input,
    mainCategory: "변경 대분류",
  })
  assert.match(calls[0].sql, /UPDATE rulesop/)
  assert.match(calls[0].sql, /main_category <=> \?[\s\S]*reg_date <=> \?[\s\S]*LIMIT 1/)
  assert.deepEqual(calls[0].parameters.slice(-7), [
    reference.mainCategory,
    reference.subCategory,
    reference.item,
    reference.title,
    reference.url,
    reference.regUser,
    reference.regDate,
  ])
})

test("rulesop 삭제는 원본 일곱 컬럼이 일치하는 한 행만 삭제한다", async () => {
  const calls = []
  const reference = {
    mainCategory: "대분류",
    subCategory: "중분류",
    item: "소분류",
    title: "제목",
    url: "https://quality.internal/rules/1",
    regUser: "quality.kim",
    regDate: "2026-08-14T01:00:00.000Z",
  }
  const repository = createRuleSopRepository({
    pool: {
      async execute(sql, parameters) {
        calls.push({ sql, parameters })
        return [{ affectedRows: 1 }]
      },
    },
  })

  assert.deepEqual(await repository.deleteDocument(reference), { deleted: true })
  assert.match(calls[0].sql, /DELETE FROM rulesop/)
  assert.match(calls[0].sql, /main_category <=> \?[\s\S]*reg_date <=> \?[\s\S]*LIMIT 1/)
  assert.deepEqual(calls[0].parameters, Object.values(reference))
})

test("rulesop 변경 대상이 없으면 충돌 오류를 반환하고 입력값을 검증한다", async () => {
  const repository = createRuleSopRepository({
    pool: { async execute() { return [{ affectedRows: 0 }] } },
  })
  const reference = {
    mainCategory: "대분류",
    subCategory: "중분류",
    item: "소분류",
    title: "제목",
    url: "https://quality.internal/rules/1",
    regUser: "quality.kim",
    regDate: "2026-08-14T01:00:00.000Z",
  }

  await assert.rejects(
    repository.deleteDocument(reference),
    RuleSopNotFoundError,
  )
  assert.throws(() => validateRuleSopFields({ ...reference, title: "" }), /title 값을 입력/)
  assert.throws(() => validateRuleSopFields({ ...reference, url: "javascript:alert(1)" }), /http 또는 https/)
  assert.throws(() => validateRuleSopFields({ ...reference, mainCategory: "가".repeat(51) }), /50자 이하/)
})
