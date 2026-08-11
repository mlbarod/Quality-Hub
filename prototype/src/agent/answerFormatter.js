const HTML_ENTITIES = Object.freeze({
  "&amp;": "&",
  "&gt;": ">",
  "&lt;": "<",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
})

function normalizeAnswerText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(?:strong|b)(?:\s[^>]*)?>/gi, "**")
    .replace(/<\/(?:strong|b)>/gi, "**")
    .replace(/<li(?:\s[^>]*)?>/gi, "- ")
    .replace(/<\/(?:li|p|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<\/(?:td|th)>\s*<(?:td|th)(?:\s[^>]*)?>/gi, " | ")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&(amp|gt|lt|nbsp|quot|#39);/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function appendPlainText(parent, value) {
  parent.append(document.createTextNode(value.replace(/\s*\|\s*/g, " · ")))
}

function appendInlineContent(parent, value) {
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`/g
  let cursor = 0
  let match
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) appendPlainText(parent, value.slice(cursor, match.index))
    if (match[1] !== undefined || match[2] !== undefined) {
      const strong = document.createElement("strong")
      appendPlainText(strong, match[1] ?? match[2])
      parent.append(strong)
    } else {
      const code = document.createElement("code")
      code.textContent = match[3]
      parent.append(code)
    }
    cursor = pattern.lastIndex
  }
  if (cursor < value.length) appendPlainText(parent, value.slice(cursor))
}

function splitTableRow(line) {
  const trimmed = line.trim()
  if (!trimmed.includes("|")) return null
  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
  return cells.length >= 2 ? cells : null
}

function isTableSeparator(cells) {
  return Array.isArray(cells) && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function appendTable(parent, headerCells, bodyRows) {
  const wrapper = document.createElement("div")
  wrapper.className = "agent-answer-table-wrap"
  const table = document.createElement("table")
  const thead = document.createElement("thead")
  const headerRow = document.createElement("tr")
  headerCells.forEach((cell) => {
    const th = document.createElement("th")
    appendInlineContent(th, cell)
    headerRow.append(th)
  })
  thead.append(headerRow)
  table.append(thead)

  if (bodyRows.length > 0) {
    const tbody = document.createElement("tbody")
    bodyRows.forEach((cells) => {
      const row = document.createElement("tr")
      headerCells.forEach((_, index) => {
        const td = document.createElement("td")
        appendInlineContent(td, cells[index] ?? "")
        row.append(td)
      })
      tbody.append(row)
    })
    table.append(tbody)
  }
  wrapper.append(table)
  parent.append(wrapper)
}

function getListItem(line) {
  const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
  if (unordered) return { ordered: false, content: unordered[1] }
  const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
  if (ordered) return { ordered: true, content: ordered[1] }
  return null
}

function isBlockStart(lines, index) {
  const line = lines[index] ?? ""
  if (!line.trim()) return true
  if (/^#{1,6}\s+/.test(line) || /^>\s?/.test(line) || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) return true
  if (getListItem(line)) return true
  const currentCells = splitTableRow(line)
  const nextCells = splitTableRow(lines[index + 1] ?? "")
  return Boolean(currentCells && nextCells)
}

export function createFormattedAnswer(content) {
  const container = document.createElement("div")
  container.className = "agent-answer-content"
  const normalized = normalizeAnswerText(content)
  if (!normalized) return container

  const lines = normalized.split("\n")
  let index = 0
  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1
      continue
    }

    const headerCells = splitTableRow(lines[index])
    const nextCells = splitTableRow(lines[index + 1] ?? "")
    if (headerCells && nextCells) {
      const hasSeparator = isTableSeparator(nextCells)
      const bodyRows = []
      index += hasSeparator ? 2 : 1
      while (index < lines.length) {
        const cells = splitTableRow(lines[index])
        if (!cells || isTableSeparator(cells)) break
        bodyRows.push(cells)
        index += 1
      }
      if (!hasSeparator && bodyRows.length === 0) bodyRows.push(nextCells)
      appendTable(container, headerCells, bodyRows)
      continue
    }

    const heading = lines[index].match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6)
      const element = document.createElement(`h${level}`)
      appendInlineContent(element, heading[2])
      container.append(element)
      index += 1
      continue
    }

    const listItem = getListItem(lines[index])
    if (listItem) {
      const list = document.createElement(listItem.ordered ? "ol" : "ul")
      while (index < lines.length) {
        const item = getListItem(lines[index])
        if (!item || item.ordered !== listItem.ordered) break
        const li = document.createElement("li")
        appendInlineContent(li, item.content)
        list.append(li)
        index += 1
      }
      container.append(list)
      continue
    }

    if (/^>\s?/.test(lines[index])) {
      const quote = document.createElement("blockquote")
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        if (quote.childNodes.length > 0) quote.append(document.createElement("br"))
        appendInlineContent(quote, lines[index].replace(/^>\s?/, ""))
        index += 1
      }
      container.append(quote)
      continue
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[index])) {
      container.append(document.createElement("hr"))
      index += 1
      continue
    }

    const paragraph = document.createElement("p")
    let lineCount = 0
    while (index < lines.length && !isBlockStart(lines, index)) {
      if (lineCount > 0) paragraph.append(document.createElement("br"))
      appendInlineContent(paragraph, lines[index].trim())
      lineCount += 1
      index += 1
    }
    container.append(paragraph)
  }
  return container
}
