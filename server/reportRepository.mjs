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

export function validateReportInput({ category, reportName, description, reportUrl, userId }) {
  return {
    category: requireText(category, "category", REPORT_LIMITS.category),
    reportName: requireText(reportName, "reportName", REPORT_LIMITS.reportName),
    description: requireText(description, "description", REPORT_LIMITS.description),
    reportUrl: requireReportUrl(reportUrl),
    userId: requireText(userId, "userId", REPORT_LIMITS.userId),
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
          report_url AS reportUrl
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

    async close() {
      await pool.end()
    },
  }
}
