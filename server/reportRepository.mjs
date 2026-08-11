import mysql from "mysql2/promise"

import { loadDbConfig } from "./conversationHistoryRepository.mjs"

const REPORT_LIMITS = {
  category: 20,
  reportName: 50,
  description: 500,
  reportUrl: 500,
  userId: 20,
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

function requireReportUrl(value) {
  const normalized = requireText(value, "reportUrl", REPORT_LIMITS.reportUrl)
  let url
  try {
    url = new URL(normalized)
  } catch {
    throw new TypeError("reportUrl은 올바른 URL이어야 합니다.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("reportUrl은 http 또는 https URL이어야 합니다.")
  }
  return normalized
}

export function validateReportFields({ category, reportName, description, reportUrl }) {
  return {
    category: requireText(category, "category", REPORT_LIMITS.category),
    reportName: requireText(reportName, "reportName", REPORT_LIMITS.reportName),
    description: requireText(description, "description", REPORT_LIMITS.description),
    reportUrl: requireReportUrl(reportUrl),
  }
}

export function validateReportInput({ category, reportName, description, reportUrl, userId }) {
  return {
    ...validateReportFields({ category, reportName, description, reportUrl }),
    userId: requireText(userId, "userId", REPORT_LIMITS.userId),
  }
}

function normalizeReportReference(reference) {
  if (!reference || typeof reference !== "object") {
    throw new TypeError("수정하거나 삭제할 Report 정보가 없습니다.")
  }
  return {
    category: reference.category ?? null,
    reportName: reference.reportName ?? null,
    description: reference.description ?? null,
    reportUrl: reference.reportUrl ?? null,
    userId: reference.userId ?? null,
    regTime: reference.regTime ?? null,
  }
}

export class ReportNotFoundError extends Error {
  constructor() {
    super("Report가 이미 변경되었거나 삭제되었습니다. 목록을 새로고침해 주세요.")
    this.name = "ReportNotFoundError"
  }
}

export function createReportPool({
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

export function createReportRepository({ pool = createReportPool() } = {}) {
  return {
    async listReports() {
      const [rows] = await pool.execute(`
        SELECT
          category,
          report_name AS reportName,
          description,
          report_url AS reportUrl,
          user_id AS userId,
          reg_time AS regTime
        FROM report_reg
        ORDER BY
          category IS NULL,
          category ASC,
          report_name IS NULL,
          report_name ASC,
          reg_time DESC
      `)
      return rows
    },

    async createReport(input) {
      const report = validateReportInput(input)
      await pool.execute(`
        INSERT INTO report_reg (
          category,
          report_name,
          description,
          report_url,
          user_id,
          reg_time
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        report.category,
        report.reportName,
        report.description,
        report.reportUrl,
        report.userId,
      ])

      return {
        category: report.category,
        reportName: report.reportName,
        description: report.description,
        reportUrl: report.reportUrl,
      }
    },

    async updateReport(reference, input) {
      const original = normalizeReportReference(reference)
      const report = validateReportFields(input)
      const isUnchanged = ["category", "reportName", "description", "reportUrl"]
        .every((field) => original[field] === report[field])

      if (!isUnchanged) {
        const [result] = await pool.execute(`
          UPDATE report_reg
          SET
            category = ?,
            report_name = ?,
            description = ?,
            report_url = ?
          WHERE category <=> ?
            AND report_name <=> ?
            AND description <=> ?
            AND report_url <=> ?
            AND user_id <=> ?
            AND reg_time <=> ?
          LIMIT 1
        `, [
          report.category,
          report.reportName,
          report.description,
          report.reportUrl,
          original.category,
          original.reportName,
          original.description,
          original.reportUrl,
          original.userId,
          original.regTime,
        ])
        if (result.affectedRows !== 1) throw new ReportNotFoundError()
      }

      return report
    },

    async deleteReport(reference) {
      const original = normalizeReportReference(reference)
      const [result] = await pool.execute(`
        DELETE FROM report_reg
        WHERE category <=> ?
          AND report_name <=> ?
          AND description <=> ?
          AND report_url <=> ?
          AND user_id <=> ?
          AND reg_time <=> ?
        LIMIT 1
      `, [
        original.category,
        original.reportName,
        original.description,
        original.reportUrl,
        original.userId,
        original.regTime,
      ])
      if (result.affectedRows !== 1) throw new ReportNotFoundError()
      return { deleted: true }
    },

    async close() {
      await pool.end()
    },
  }
}
