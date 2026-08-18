import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  CHANGE_CATEGORY_LIMITS,
  createChangeCategoryRepository,
  validateChangeCategoryInput,
  validateChangeCategorySheet,
} from "../server/changeCategoryRepository.mjs"

const migration = await readFile(new URL("../db/migrations/002_change_category.sql", import.meta.url), "utf8")

const sheet = {
  columnWidths: [120, 180],
  rows: [{
    height: 28,
    cells: [
      { text: "구분", rowSpan: 1, colSpan: 1, style: { backgroundColor: "#e8f5fd", fontWeight: "700" } },
      { text: "내용", rowSpan: 1, colSpan: 1, style: {} },
    ],
  }],
}

test("변승위 Category 표와 선택적 XLSX 파일 입력을 검증한다", () => {
  assert.deepEqual(validateChangeCategorySheet(sheet), sheet)
  const workbook = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01])
  const input = validateChangeCategoryInput({
    sheet,
    file: { name: "변승위.xlsx", dataBase64: workbook.toString("base64") },
    userId: "quality.kim",
  })
  assert.equal(input.sheetText, "구분\n내용")
  assert.equal(input.file.name, "변승위.xlsx")
  assert.deepEqual(input.file.data, workbook)
  assert.equal(validateChangeCategoryInput({ sheet, file: null, userId: "quality.kim" }).file, null)
})

test("같은 DB의 별도 테이블에 최신 한 건과 선택적 원본 BLOB을 저장하는 DDL을 제공한다", () => {
  assert.match(migration, /CREATE TABLE quality_hub_change_category/)
  assert.match(migration, /singleton_id TINYINT UNSIGNED NOT NULL/)
  assert.match(migration, /sheet_json LONGTEXT NOT NULL/)
  assert.match(migration, /source_file_blob MEDIUMBLOB NULL/)
  assert.match(migration, /PRIMARY KEY \(singleton_id\)/)
})

test("위험한 스타일, 잘못된 파일과 과대 표를 거부한다", () => {
  assert.throws(() => validateChangeCategorySheet({ rows: [] }), /비어 있습니다/)
  assert.throws(() => validateChangeCategorySheet({ rows: [{ cells: [{ text: "x", style: { backgroundImage: "url(javascript:1)" } }] }] }), /허용되지 않은/)
  assert.throws(() => validateChangeCategoryInput({ sheet, file: { name: "변승위.xls", dataBase64: "UEs=" }, userId: "user" }), /.xlsx 형식/)
  assert.throws(() => validateChangeCategoryInput({ sheet, file: { name: "변승위.xlsx", dataBase64: Buffer.alloc(CHANGE_CATEGORY_LIMITS.maxFileBytes + 1).toString("base64") }, userId: "user" }), /5MB 이하/)
})

test("Category 최신 1건을 조회하고 원본 없이 교체한다", async () => {
  const calls = []
  const stored = {
    sheetJson: JSON.stringify(sheet),
    fileName: null,
    fileSize: null,
    updatedAt: "2026-08-18T08:00:00.000Z",
  }
  const pool = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      if (/^\s*SELECT[\s\S]*sheet_json/.test(sql)) return [[stored]]
      return [{ affectedRows: 1 }]
    },
  }
  const repository = createChangeCategoryRepository({ pool })
  const result = await repository.replaceCategory({ sheet, file: null, userId: "quality.kim" })
  assert.deepEqual(result.sheet, sheet)
  assert.match(calls[0].sql, /INSERT INTO quality_hub_change_category/)
  assert.match(calls[0].sql, /ON DUPLICATE KEY UPDATE/)
  assert.equal(calls[0].parameters[2], null)
  assert.equal(calls[0].parameters[5], null)
  assert.equal(calls[0].parameters[6], "quality.kim")
})

test("Category 원본 XLSX BLOB을 별도 조회한다", async () => {
  const file = { name: "category.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 4, data: Buffer.from("PK12") }
  const repository = createChangeCategoryRepository({
    pool: { async execute(sql) { assert.match(sql, /source_file_blob IS NOT NULL/); return [[file]] } },
  })
  assert.deepEqual(await repository.getSourceFile(), file)
})
