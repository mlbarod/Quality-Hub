import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  CHANGE_CATEGORY_LIMITS,
  createChangeCategoryRepository,
  validateChangeCategoryInput,
} from "../server/changeCategoryRepository.mjs"

const migration = await readFile(new URL("../db/migrations/002_change_category.sql", import.meta.url), "utf8")
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const image = {
  name: "변승위-category.png",
  type: "image/png",
  width: 1280,
  height: 600,
  dataBase64: png.toString("base64"),
}

test("붙여넣은 Category 그림과 사용자 ID를 검증한다", () => {
  const input = validateChangeCategoryInput({ image, userId: "quality.kim" })
  assert.equal(input.image.name, "변승위-category.png")
  assert.equal(input.image.type, "image/png")
  assert.equal(input.image.width, 1280)
  assert.equal(input.image.height, 600)
  assert.deepEqual(input.image.data, png)
  assert.equal(input.userId, "quality.kim")
})

test("지원하지 않는 형식, 잘못된 시그니처와 과대 그림을 거부한다", () => {
  assert.throws(() => validateChangeCategoryInput({ image: { ...image, type: "image/svg+xml" }, userId: "user" }), /PNG, JPEG 또는 WebP/)
  assert.throws(() => validateChangeCategoryInput({ image: { ...image, dataBase64: Buffer.from("not-png").toString("base64") }, userId: "user" }), /파일 형식이 일치하지 않습니다/)
  const oversized = Buffer.alloc(CHANGE_CATEGORY_LIMITS.maxImageBytes + 1)
  oversized.set(png)
  assert.throws(() => validateChangeCategoryInput({ image: { ...image, dataBase64: oversized.toString("base64") }, userId: "user" }), /10MB 이하/)
  assert.throws(() => validateChangeCategoryInput({ image: { ...image, width: 1200, height: 800 }, userId: "user" }), /1280×600px로 변환/)
})

test("같은 DB의 별도 테이블에 최신 그림 한 건을 저장하는 DDL을 제공한다", () => {
  assert.match(migration, /CREATE TABLE quality_hub_change_category/)
  assert.match(migration, /singleton_id TINYINT UNSIGNED NOT NULL/)
  assert.match(migration, /image_type VARCHAR\(100\) NOT NULL/)
  assert.match(migration, /image_width INT UNSIGNED NOT NULL/)
  assert.match(migration, /image_blob MEDIUMBLOB NOT NULL/)
  assert.match(migration, /PRIMARY KEY \(singleton_id\)/)
  assert.doesNotMatch(migration, /sheet_json|source_file_blob/)
})

test("Category 최신 그림을 singleton upsert하고 메타데이터를 반환한다", async () => {
  const calls = []
  const stored = {
    imageName: image.name,
    imageType: image.type,
    imageSize: png.length,
    imageWidth: image.width,
    imageHeight: image.height,
    updatedAt: "2026-08-18T08:00:00.000Z",
  }
  const pool = {
    async execute(sql, parameters) {
      calls.push({ sql, parameters })
      if (/^\s*SELECT[\s\S]*image_name/.test(sql)) return [[stored]]
      return [{ affectedRows: 1 }]
    },
  }
  const repository = createChangeCategoryRepository({ pool })
  const result = await repository.replaceCategory({ image, userId: "quality.kim" })
  assert.deepEqual(result, stored)
  assert.match(calls[0].sql, /INSERT INTO quality_hub_change_category/)
  assert.match(calls[0].sql, /ON DUPLICATE KEY UPDATE/)
  assert.equal(calls[0].parameters[0], image.name)
  assert.deepEqual(calls[0].parameters[5], png)
  assert.equal(calls[0].parameters[6], "quality.kim")
})

test("Category 그림 BLOB을 별도 조회한다", async () => {
  const storedImage = { type: "image/png", data: png }
  const repository = createChangeCategoryRepository({
    pool: { async execute(sql) { assert.match(sql, /image_blob AS data/); return [[storedImage]] } },
  })
  assert.deepEqual(await repository.getImage(), storedImage)
})
