import { createQnaPool } from "../server/qnaRepository.mjs"

const expectedTables = [
  "quality_hub_qna_question",
  "quality_hub_qna_message",
  "quality_hub_qna_question_tag",
  "quality_hub_qna_notification",
  "quality_hub_qna_history",
]

const pool = createQnaPool()
try {
  const [[versionRow]] = await pool.query("SELECT VERSION() AS version")
  const [tableRows] = await pool.execute(`
    SELECT table_name AS tableName
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN (?, ?, ?, ?, ?)
    ORDER BY table_name
  `, expectedTables)
  const found = new Set(tableRows.map((row) => row.tableName))
  const missingTables = expectedTables.filter((tableName) => !found.has(tableName))
  if (missingTables.length) throw new Error(`Q&A 테이블이 없습니다: ${missingTables.join(", ")}`)

  const counts = {}
  for (const tableName of expectedTables) {
    const [rows] = await pool.query(`SELECT COUNT(*) AS rowCount FROM \`${tableName}\``)
    counts[tableName] = Number(rows[0].rowCount)
  }
  console.log(JSON.stringify({ status: "ok", databaseVersion: versionRow.version, tableCount: found.size, rowCounts: counts }))
} finally {
  await pool.end()
}
