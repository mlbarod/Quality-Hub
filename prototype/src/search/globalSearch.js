function decodeHtmlEntities(value) {
  if (typeof DOMParser === "function") {
    return new DOMParser().parseFromString(value, "text/html").body.textContent ?? ""
  }

  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

export function htmlToSearchText(value) {
  const html = String(value ?? "")
  if (!html) return ""
  const searchableHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  if (typeof DOMParser === "function") return decodeHtmlEntities(searchableHtml)

  return decodeHtmlEntities(searchableHtml.replace(/<[^>]+>/g, " "))
}

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .trim()
}

export function matchesSearchQuery(searchText, query) {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean)
  if (!terms.length) return true
  const normalizedTarget = normalizeSearchText(searchText)
  return terms.every((term) => normalizedTarget.includes(term))
}

export function buildTitleSearchText(title) {
  return String(title ?? "")
}

export function buildQnaSearchText(post) {
  const body = htmlToSearchText(post?.content ?? post?.excerpt ?? "")
  const comments = Array.isArray(post?.messages)
    ? post.messages.filter((message) => !message?.hidden).map((message) => message?.body ?? "")
    : []
  return [post?.title, body, ...comments].filter(Boolean).join(" ")
}
