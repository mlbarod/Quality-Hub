import mysql from "mysql2/promise"

import { loadDbConfig } from "./conversationHistoryRepository.mjs"

export const CHANGE_CATEGORY_LIMITS = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxSheetJsonBytes: 1024 * 1024,
  maxRows: 500,
  maxCells: 10_000,
  maxCellTextLength: 10_000,
  maxFileNameLength: 255,
  maxUserIdLength: 100,
})

const ALLOWED_CELL_STYLE_KEYS = new Set([
  "backgroundColor",
  "color",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "textAlign",
  "textDecoration",
  "verticalAlign",
  "whiteSpace",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
])

function requireText(value, fieldName, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${fieldName} 값을 입력해 주세요.`)
  const normalized = value.trim()
  if (normalized.length > maxLength) throw new TypeError(`${fieldName} 값은 ${maxLength}자 이하여야 합니다.`)
  return normalized
}

function normalizePixelSize(value, fieldName, maximum) {
  if (value === undefined || value === null || value === "") return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > maximum) throw new TypeError(`${fieldName} 값이 올바르지 않습니다.`)
  return Math.round(number * 100) / 100
}

function normalizeCell(cell) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) throw new TypeError("표 셀 형식이 올바르지 않습니다.")
  const text = String(cell.text ?? "")
  if (text.length > CHANGE_CATEGORY_LIMITS.maxCellTextLength) throw new TypeError("표 셀 내용이 너무 깁니다.")
  const rowSpan = Number(cell.rowSpan ?? 1)
  const colSpan = Number(cell.colSpan ?? 1)
  if (!Number.isInteger(rowSpan) || rowSpan < 1 || rowSpan > 500 || !Number.isInteger(colSpan) || colSpan < 1 || colSpan > 500) {
    throw new TypeError("병합 셀 범위가 올바르지 않습니다.")
  }
  const style = {}
  if (cell.style !== undefined) {
    if (!cell.style || typeof cell.style !== "object" || Array.isArray(cell.style)) throw new TypeError("표 셀 스타일 형식이 올바르지 않습니다.")
    for (const [key, value] of Object.entries(cell.style)) {
      if (!ALLOWED_CELL_STYLE_KEYS.has(key) || typeof value !== "string" || value.length > 200) {
        throw new TypeError("허용되지 않은 표 셀 스타일이 포함되어 있습니다.")
      }
      if (value) style[key] = value
    }
  }
  return { text, rowSpan, colSpan, style }
}

export function validateChangeCategorySheet(sheet) {
  if (!sheet || typeof sheet !== "object" || Array.isArray(sheet) || !Array.isArray(sheet.rows)) {
    throw new TypeError("붙여넣은 Excel 표 형식이 올바르지 않습니다.")
  }
  if (sheet.rows.length === 0) throw new TypeError("붙여넣은 Excel 표가 비어 있습니다.")
  if (sheet.rows.length > CHANGE_CATEGORY_LIMITS.maxRows) throw new TypeError(`표는 ${CHANGE_CATEGORY_LIMITS.maxRows}행 이하여야 합니다.`)

  let cellCount = 0
  const rows = sheet.rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || !Array.isArray(row.cells)) {
      throw new TypeError("표 행 형식이 올바르지 않습니다.")
    }
    cellCount += row.cells.length
    if (cellCount > CHANGE_CATEGORY_LIMITS.maxCells) throw new TypeError(`표는 ${CHANGE_CATEGORY_LIMITS.maxCells}셀 이하여야 합니다.`)
    return {
      height: normalizePixelSize(row.height, "행 높이", 500),
      cells: row.cells.map(normalizeCell),
    }
  })
  const columnWidths = Array.isArray(sheet.columnWidths)
    ? sheet.columnWidths.slice(0, 500).map((width) => normalizePixelSize(width, "열 너비", 1000))
    : []
  const normalized = { rows, columnWidths }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > CHANGE_CATEGORY_LIMITS.maxSheetJsonBytes) {
    throw new TypeError("붙여넣은 Excel 표가 너무 큽니다.")
  }
  return normalized
}

function decodeOptionalWorkbook(file) {
  if (file === null || file === undefined) return null
  if (!file || typeof file !== "object" || Array.isArray(file)) throw new TypeError("원본 Excel 파일 형식이 올바르지 않습니다.")
  const name = requireText(file.name, "파일명", CHANGE_CATEGORY_LIMITS.maxFileNameLength)
  if (!name.toLocaleLowerCase("en-US").endsWith(".xlsx")) throw new TypeError("원본 파일은 .xlsx 형식만 사용할 수 있습니다.")
  if (typeof file.dataBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataBase64)) {
    throw new TypeError("원본 Excel 파일 데이터가 올바르지 않습니다.")
  }
  const data = Buffer.from(file.dataBase64, "base64")
  if (data.length === 0 || data.length > CHANGE_CATEGORY_LIMITS.maxFileBytes) {
    throw new TypeError(`원본 Excel 파일은 ${CHANGE_CATEGORY_LIMITS.maxFileBytes / 1024 / 1024}MB 이하여야 합니다.`)
  }
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new TypeError("원본 Excel 파일의 내용이 .xlsx 형식이 아닙니다.")
  return {
    name,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: data.length,
    data,
  }
}

export function validateChangeCategoryInput({ sheet, file, userId }) {
  const normalizedSheet = validateChangeCategorySheet(sheet)
  const normalizedUserId = requireText(userId, "userId", CHANGE_CATEGORY_LIMITS.maxUserIdLength)
  return {
    sheet: normalizedSheet,
    sheetText: normalizedSheet.rows.flatMap((row) => row.cells.map((cell) => cell.text)).filter(Boolean).join("\n"),
    file: decodeOptionalWorkbook(file),
    userId: normalizedUserId,
  }
}

export function createChangeCategoryPool({ config = loadDbConfig(), mysqlImpl = mysql } = {}) {
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

export function createChangeCategoryRepository({ pool = createChangeCategoryPool() } = {}) {
  const getCategory = async () => {
    const [rows] = await pool.execute(`
        SELECT
          sheet_json AS sheetJson,
          source_file_name AS fileName,
          source_file_size AS fileSize,
          updated_at AS updatedAt
        FROM quality_hub_change_category
        WHERE singleton_id = 1
        LIMIT 1
      `)
    const row = rows[0]
    if (!row) return null
    return {
      sheet: JSON.parse(row.sheetJson),
      fileName: row.fileName ?? null,
      fileSize: row.fileSize ?? null,
      updatedAt: row.updatedAt,
    }
  }

  return {
    getCategory,

    async replaceCategory(input) {
      const category = validateChangeCategoryInput(input)
      const sheetJson = JSON.stringify(category.sheet)
      await pool.execute(`
        INSERT INTO quality_hub_change_category (
          singleton_id,
          sheet_json,
          sheet_text,
          source_file_name,
          source_file_type,
          source_file_size,
          source_file_blob,
          updated_by,
          updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
          sheet_json = VALUES(sheet_json),
          sheet_text = VALUES(sheet_text),
          source_file_name = VALUES(source_file_name),
          source_file_type = VALUES(source_file_type),
          source_file_size = VALUES(source_file_size),
          source_file_blob = VALUES(source_file_blob),
          updated_by = VALUES(updated_by),
          updated_at = VALUES(updated_at)
      `, [
        sheetJson,
        category.sheetText,
        category.file?.name ?? null,
        category.file?.type ?? null,
        category.file?.size ?? null,
        category.file?.data ?? null,
        category.userId,
      ])
      return getCategory()
    },

    async getSourceFile() {
      const [rows] = await pool.execute(`
        SELECT
          source_file_name AS name,
          source_file_type AS type,
          source_file_size AS size,
          source_file_blob AS data
        FROM quality_hub_change_category
        WHERE singleton_id = 1
          AND source_file_blob IS NOT NULL
        LIMIT 1
      `)
      return rows[0] ?? null
    },

    async close() {
      await pool.end()
    },
  }
}
