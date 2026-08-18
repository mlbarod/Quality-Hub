const ALLOWED_STYLE_PROPERTIES = [
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
]

const toPixels = (value) => {
  const source = String(value ?? "").trim().toLowerCase()
  const number = Number.parseFloat(source)
  if (!Number.isFinite(number) || number <= 0) return null
  if (source.endsWith("pt")) return Math.round(number * 4 / 3 * 100) / 100
  return Math.round(number * 100) / 100
}

const collectClassStyles = (parsedDocument) => {
  const styles = new Map()
  parsedDocument.querySelectorAll("style").forEach((styleElement) => {
    const source = styleElement.textContent ?? ""
    const matcher = /\.([A-Za-z_][\w-]*)\s*\{([^}]*)\}/g
    for (const match of source.matchAll(matcher)) {
      styles.set(match[1], `${styles.get(match[1]) ?? ""};${match[2]}`)
    }
  })
  return styles
}

const cellText = (cell, documentImpl) => {
  const clone = cell.cloneNode(true)
  clone.querySelectorAll("br").forEach((br) => br.replaceWith(documentImpl.createTextNode("\n")))
  return (clone.textContent ?? "").replace(/\u00a0/g, " ").trim()
}

const safeCellStyle = (cell, classStyles, documentImpl) => {
  const scratch = documentImpl.createElement("span")
  const classCss = [...cell.classList].map((name) => classStyles.get(name) ?? "").join(";")
  scratch.style.cssText = `${classCss};${cell.getAttribute("style") ?? ""}`
  if (cell.getAttribute("bgcolor")) scratch.style.backgroundColor = cell.getAttribute("bgcolor")
  if (cell.getAttribute("align")) scratch.style.textAlign = cell.getAttribute("align")
  if (cell.getAttribute("valign")) scratch.style.verticalAlign = cell.getAttribute("valign")
  const style = {}
  ALLOWED_STYLE_PROPERTIES.forEach((property) => {
    const value = scratch.style[property]
    if (value && !/url\s*\(|expression\s*\(/i.test(value)) style[property] = value
  })
  return style
}

const parseHtmlTable = (html, { documentImpl, DOMParserImpl }) => {
  if (!html || typeof DOMParserImpl !== "function") return null
  const parsed = new DOMParserImpl().parseFromString(html, "text/html")
  const table = parsed.querySelector("table")
  if (!table) return null
  const classStyles = collectClassStyles(parsed)
  const sourceRows = [...table.querySelectorAll("tr")]
  if (!sourceRows.length) return null
  const rows = sourceRows.map((row) => ({
    height: toPixels(row.style.height || row.getAttribute("height")),
    cells: [...row.children]
      .filter((cell) => cell.matches("td, th"))
      .map((cell) => ({
        text: cellText(cell, documentImpl),
        rowSpan: Math.max(1, Math.min(500, cell.rowSpan || 1)),
        colSpan: Math.max(1, Math.min(500, cell.colSpan || 1)),
        style: safeCellStyle(cell, classStyles, documentImpl),
      })),
  })).filter((row) => row.cells.length)
  if (!rows.length) return null

  const columnWidths = [...table.querySelectorAll(":scope > colgroup > col, :scope > col")]
    .flatMap((column) => {
      const width = toPixels(column.style.width || column.getAttribute("width"))
      const span = Math.max(1, Math.min(500, Number(column.getAttribute("span")) || 1))
      return Array.from({ length: span }, () => width)
    })
  if (!columnWidths.length) {
    rows[0].cells.forEach((cell, index) => {
      const sourceCell = [...sourceRows[0].children].filter((item) => item.matches("td, th"))[index]
      const width = toPixels(sourceCell?.style.width || sourceCell?.getAttribute("width"))
      for (let spanIndex = 0; spanIndex < cell.colSpan; spanIndex += 1) columnWidths.push(width)
    })
  }
  return { rows, columnWidths }
}

const parseTextTable = (text) => {
  const rows = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line, index, lines) => line.length || index < lines.length - 1)
    .map((line) => ({
      height: null,
      cells: line.split("\t").map((value) => ({ text: value, rowSpan: 1, colSpan: 1, style: {} })),
    }))
  return rows.length ? { rows, columnWidths: [] } : null
}

export function parseChangeCategoryClipboard({ html = "", text = "" } = {}, {
  documentImpl = globalThis.document,
  DOMParserImpl = globalThis.DOMParser,
} = {}) {
  if (!documentImpl) throw new TypeError("표를 처리할 문서 환경이 없습니다.")
  const sheet = parseHtmlTable(html, { documentImpl, DOMParserImpl }) ?? parseTextTable(text)
  if (!sheet) throw new TypeError("Excel에서 복사한 표를 찾지 못했습니다.")
  const cellCount = sheet.rows.reduce((sum, row) => sum + row.cells.length, 0)
  if (sheet.rows.length > 500 || cellCount > 10_000) throw new TypeError("표는 500행, 10,000셀 이하여야 합니다.")
  return sheet
}

export function renderChangeCategorySheet(container, sheet, { documentImpl = globalThis.document } = {}) {
  if (!container || typeof container.replaceChildren !== "function" || !sheet?.rows?.length) return false
  const table = documentImpl.createElement("table")
  table.className = "change-category-table"
  if (sheet.columnWidths?.length) {
    const colgroup = documentImpl.createElement("colgroup")
    sheet.columnWidths.forEach((width) => {
      const column = documentImpl.createElement("col")
      if (width) column.style.width = `${width}px`
      colgroup.append(column)
    })
    table.append(colgroup)
  }
  const tbody = documentImpl.createElement("tbody")
  sheet.rows.forEach((row) => {
    const tr = documentImpl.createElement("tr")
    if (row.height) tr.style.height = `${row.height}px`
    row.cells.forEach((cell) => {
      const td = documentImpl.createElement("td")
      td.textContent = cell.text
      td.rowSpan = cell.rowSpan || 1
      td.colSpan = cell.colSpan || 1
      ALLOWED_STYLE_PROPERTIES.forEach((property) => {
        const value = cell.style?.[property]
        if (typeof value === "string" && !/url\s*\(|expression\s*\(/i.test(value)) td.style[property] = value
      })
      tr.append(td)
    })
    tbody.append(tr)
  })
  table.append(tbody)
  container.replaceChildren(table)
  return true
}

export function formatCategoryFileSize(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ""
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

export async function workbookFileToPayload(file, { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (!(file instanceof globalThis.File)) return null
  if (!file.name.toLocaleLowerCase("en-US").endsWith(".xlsx")) throw new TypeError("원본 파일은 .xlsx 형식만 선택할 수 있습니다.")
  if (file.size <= 0 || file.size > maxBytes) throw new TypeError(`원본 Excel 파일은 ${maxBytes / 1024 / 1024}MB 이하여야 합니다.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new TypeError("원본 Excel 파일의 내용이 .xlsx 형식이 아닙니다.")
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return { name: file.name, dataBase64: globalThis.btoa(binary) }
}
