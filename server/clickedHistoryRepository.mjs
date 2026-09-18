import mysql from "mysql2/promise"
import { loadDbConfig } from "./conversationHistoryRepository.mjs"

export const CLICK_CATEGORIES = new Set(["각종 Report조회", "Rule&SOP", "품질 VOE", "통합 검색", "품질 Agent"])

export function validateClickedHistory({ category, contents = null, userId, entryDate } = {}) {
  if (!CLICK_CATEGORIES.has(category)) throw new TypeError("지원하지 않는 App입니다.")
  if (typeof userId !== "string" || !userId.trim() || [...userId.trim()].length > 20) {
    throw new TypeError("사용자 ID가 올바르지 않습니다.")
  }
  if (contents !== null && typeof contents !== "string") throw new TypeError("제목이 올바르지 않습니다.")
  if (entryDate !== undefined && (typeof entryDate !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(entryDate))) {
    throw new TypeError("진입 시각이 올바르지 않습니다.")
  }
  return {
    category,
    contents: category === "품질 Agent" || contents === null ? null : [...contents.trim()].slice(0, 100).join("") || null,
    userId: userId.trim(),
    ...(entryDate === undefined ? {} : { entryDate }),
  }
}

export function createClickedHistoryRepository({ pool = mysql.createPool({
  ...loadDbConfig(),
  charset: "utf8mb4",
  connectionLimit: 2,
  waitForConnections: true,
  queueLimit: 100,
  connectTimeout: 3000,
}) } = {}) {
  return {
    async recordClick(input) {
      const { category, contents, userId, entryDate } = validateClickedHistory(input)
      if (contents === null) {
        const connection = await pool.getConnection()
        try {
          // 고유키가 없는 기존 스키마에서 NULL 행을 찾을 수 있도록 DB 시각을 그대로 반환한다.
          const [[row]] = await connection.execute({ sql: "SELECT DATE_FORMAT(CURRENT_TIMESTAMP, '%Y-%m-%d %H:%i:%s') AS entryDate", timeout: 5000 })
          await connection.execute({
            sql: "INSERT INTO clicked_history (category, contents, update_date, knox_id) VALUES (?, NULL, ?, ?)",
            timeout: 5000,
          }, [category, row.entryDate, userId])
          return { entryDate: row.entryDate }
        } finally {
          connection.release()
        }
      }
      if (entryDate !== undefined) {
        const [result] = await pool.execute({
          sql: "UPDATE clicked_history SET contents = ?, update_date = CURRENT_TIMESTAMP WHERE category = ? AND contents IS NULL AND update_date = ? AND knox_id = ? LIMIT 1",
          timeout: 5000,
        }, [contents, category, entryDate, userId])
        if (result.affectedRows === 1) return
      }
      await pool.execute({
        sql: "INSERT INTO clicked_history (category, contents, update_date, knox_id) VALUES (?, ?, CURRENT_TIMESTAMP, ?)",
        timeout: 5000,
      }, [category, contents, userId])
    },
    async close() { await pool.end() },
  }
}
