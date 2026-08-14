import mysql from "mysql2/promise"

import { loadDbConfig } from "./conversationHistoryRepository.mjs"

const RULE_SOP_LIMITS = {
  mainCategory: 50,
  subCategory: 50,
  item: 50,
  title: 200,
  url: 500,
}

function requireText(value, fieldName, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldName} 값을 입력해 주세요.`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw new TypeError(`${fieldName} 값은 ${maxLength}자 이하여야 합니다.`)
  }
  return normalized
}

function requireRuleSopUrl(value) {
  const normalized = requireText(value, "url", RULE_SOP_LIMITS.url)
  let url
  try {
    url = new URL(normalized)
  } catch {
    throw new TypeError("url은 올바른 URL이어야 합니다.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("url은 http 또는 https URL이어야 합니다.")
  }
  return normalized
}

export function validateRuleSopFields({ mainCategory, subCategory, item, title, url }) {
  return {
    mainCategory: requireText(mainCategory, "mainCategory", RULE_SOP_LIMITS.mainCategory),
    subCategory: requireText(subCategory, "subCategory", RULE_SOP_LIMITS.subCategory),
    item: requireText(item, "item", RULE_SOP_LIMITS.item),
    title: requireText(title, "title", RULE_SOP_LIMITS.title),
    url: requireRuleSopUrl(url),
  }
}

function normalizeRuleSopReference(reference) {
  if (!reference || typeof reference !== "object") {
    throw new TypeError("수정하거나 삭제할 Rule&SOP 문서 정보가 없습니다.")
  }
  return {
    mainCategory: reference.mainCategory ?? null,
    subCategory: reference.subCategory ?? null,
    item: reference.item ?? null,
    title: reference.title ?? null,
    url: reference.url ?? null,
    regUser: reference.regUser ?? null,
    regDate: reference.regDate ?? null,
  }
}

export class RuleSopNotFoundError extends Error {
  constructor() {
    super("Rule&SOP 문서가 이미 변경되었거나 삭제되었습니다. 목록을 새로고침해 주세요.")
    this.name = "RuleSopNotFoundError"
  }
}

export function createRuleSopPool({
  config = loadDbConfig(),
  mysqlImpl = mysql,
} = {}) {
  return mysqlImpl.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  })
}

export function createRuleSopRepository({ pool = createRuleSopPool() } = {}) {
  return {
    async listDocuments() {
      const [rows] = await pool.execute(`
        SELECT
          main_category AS mainCategory,
          sub_category AS subCategory,
          item,
          title,
          url,
          reg_user AS regUser,
          reg_date AS regDate
        FROM rulesop
        ORDER BY
          main_category IS NULL,
          main_category ASC,
          sub_category IS NULL,
          sub_category ASC,
          item IS NULL,
          item ASC,
          title IS NULL,
          title ASC,
          reg_date DESC
      `)
      return rows
    },

    async updateDocument(reference, input) {
      const original = normalizeRuleSopReference(reference)
      const document = validateRuleSopFields(input)
      const isUnchanged = ["mainCategory", "subCategory", "item", "title", "url"]
        .every((field) => original[field] === document[field])

      if (!isUnchanged) {
        const [result] = await pool.execute(`
          UPDATE rulesop
          SET
            main_category = ?,
            sub_category = ?,
            item = ?,
            title = ?,
            url = ?
          WHERE main_category <=> ?
            AND sub_category <=> ?
            AND item <=> ?
            AND title <=> ?
            AND url <=> ?
            AND reg_user <=> ?
            AND reg_date <=> ?
          LIMIT 1
        `, [
          document.mainCategory,
          document.subCategory,
          document.item,
          document.title,
          document.url,
          original.mainCategory,
          original.subCategory,
          original.item,
          original.title,
          original.url,
          original.regUser,
          original.regDate,
        ])
        if (result.affectedRows !== 1) throw new RuleSopNotFoundError()
      }

      return document
    },

    async deleteDocument(reference) {
      const original = normalizeRuleSopReference(reference)
      const [result] = await pool.execute(`
        DELETE FROM rulesop
        WHERE main_category <=> ?
          AND sub_category <=> ?
          AND item <=> ?
          AND title <=> ?
          AND url <=> ?
          AND reg_user <=> ?
          AND reg_date <=> ?
        LIMIT 1
      `, [
        original.mainCategory,
        original.subCategory,
        original.item,
        original.title,
        original.url,
        original.regUser,
        original.regDate,
      ])
      if (result.affectedRows !== 1) throw new RuleSopNotFoundError()
      return { deleted: true }
    },

    async close() {
      await pool.end()
    },
  }
}
