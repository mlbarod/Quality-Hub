import mysql from "mysql2/promise"

import { loadDbConfig } from "./conversationHistoryRepository.mjs"

export function createDashboardPool({
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

export function createDashboardRepository({ pool = createDashboardPool() } = {}) {
  return {
    async getDashboard() {
      const [rows] = await pool.execute(`
        SELECT url
        FROM dashboard_report
        LIMIT 1
      `)
      if (!Array.isArray(rows) || rows.length === 0) return null
      return { url: rows[0].url ?? null }
    },

    async close() {
      await pool.end()
    },
  }
}
