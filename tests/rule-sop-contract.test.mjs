import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")

test("관리 Rule 앱 명칭과 진입점을 Rule&SOP로 제공한다", () => {
  assert.match(html, /<strong>Rule&amp;SOP<\/strong>/)
  assert.match(html, /data-rule-open/)
  assert.match(html, /data-rule-workspace/)
  assert.doesNotMatch(html, />관리 Rule</)
})

test("변승위 Category분류를 접근 가능한 아코디언으로 제공한다", () => {
  assert.match(
    html,
    /aria-expanded="false" aria-controls="change-category-panel" data-rule-category-toggle/,
  )
  assert.match(html, /id="change-category-panel"[^>]*hidden data-rule-category-panel/)
  assert.match(script, /button\.setAttribute\("aria-expanded", String\(!isExpanded\)\)/)
})

test("대분류, 중분류, 소분류 필터가 모든 예시 카드 분류값을 포함한다", () => {
  const filterValues = {
    major: new Set(),
    middle: new Set(),
    minor: new Set(),
  }

  for (const match of html.matchAll(/data-rule-filter="(major|middle|minor)" data-rule-filter-value="([^"]+)"/g)) {
    filterValues[match[1]].add(match[2])
  }

  Object.values(filterValues).forEach((values) => assert.ok(values.has("all")))

  const cards = [...html.matchAll(
    /data-rule-card data-rule-major="([^"]+)" data-rule-middle="([^"]+)" data-rule-minor="([^"]+)"/g,
  )]
  assert.equal(cards.length, 8)

  cards.forEach(([, major, middle, minor]) => {
    assert.ok(filterValues.major.has(major), `대분류 필터 누락: ${major}`)
    assert.ok(filterValues.middle.has(middle), `중분류 필터 누락: ${middle}`)
    assert.ok(filterValues.minor.has(minor), `소분류 필터 누락: ${minor}`)
  })
})

test("필터 결과 수, 요약과 카드 재배치 상태를 갱신한다", () => {
  assert.match(script, /data-rule-result-count/)
  assert.match(script, /data-rule-filter-summary/)
  assert.match(script, /playRuleCardArrangement/)
  assert.match(script, /prefers-reduced-motion: reduce/)
})
