import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")
const qnaCss = await readFile(new URL("../prototype/src/qna.css", import.meta.url), "utf8")
const qnaApp = await readFile(new URL("../prototype/src/qna/QnaApp.jsx", import.meta.url), "utf8")

test("Quality Hub 브랜드가 쿼리를 제거하고 메인 화면을 새로고침한다", () => {
  assert.match(html, /class="brand"[^>]*data-home-refresh/)
  assert.match(script, /querySelectorAll\("\[data-home-refresh\]"\)/)
  assert.match(script, /homeUrl\.search = ""/)
  assert.match(script, /window\.location\.reload\(\)/)
})

test("품질 업무 메뉴에서 각종 Report 조회로 진입한다", () => {
  const qualityMenu = html.match(/<div class="top-nav-menu">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? ""
  assert.match(qualityMenu, /data-report-open/)
  assert.match(qualityMenu, /<strong>각종 Report 조회<\/strong>/)
})

test("Report 카테고리를 FDC, SPC, VM 각 4개로 제공한다", () => {
  const filters = [...html.matchAll(/data-report-filter="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual([...new Set(filters)], ["all", "fdc", "spc", "vm"])

  const cardCategories = [...html.matchAll(/data-report-card data-report-category="([^"]+)"/g)].map((match) => match[1])
  assert.equal(cardCategories.length, 12)
  assert.deepEqual(Object.fromEntries(["fdc", "spc", "vm"].map((category) => [category, cardCategories.filter((value) => value === category).length])), {
    fdc: 4,
    spc: 4,
    vm: 4,
  })
  assert.match(html, /<strong>3<\/strong><small>카테고리<\/small>/)
  assert.match(html, /class="report-summary-card" role="group" aria-label="등록된 Report 요약"/)
})

test("질문 작성 버튼의 텍스트와 아이콘 모션은 동작 감소 설정을 따른다", () => {
  assert.match(qnaCss, /@keyframes qna-write-icon/)
  assert.match(qnaCss, /@keyframes qna-write-label/)
  assert.match(qnaCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(qnaCss, /\.qna-write-icon,[\s\S]*\.qna-write-label/)
  assert.match(qnaCss, /\.qna-scope \.qna-write-button \{[\s\S]*box-shadow: none;/)
  assert.match(qnaCss, /\.qna-scope \.qna-write-button \{[\s\S]*font-size: 16px;/)
  assert.match(qnaCss, /\.qna-write-button \.qna-write-icon svg \{[\s\S]*width: 21px;[\s\S]*height: 21px;/)
})

test("메인 App 카드는 실제 Report 화면과 기능별 개별 모션을 사용한다", () => {
  assert.match(html, /class="report-screen-preview"/)
  assert.match(html, /class="report-screen-filters"><i class="is-selected">전체<\/i><i>FDC<\/i><i>SPC<\/i><i>VM<\/i>/)
  assert.match(styles, /@keyframes report-line-draw/)
  assert.match(styles, /@keyframes rule-scope-unfold/)
  assert.match(styles, /@keyframes qna-answer-sequence/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
})

test("제목 크기는 유지하고 주요 설명 문구를 10px 이상으로 표시한다", () => {
  assert.match(styles, /--description-sm: 10px;/)
  assert.match(styles, /--description-md: 11px;/)
  assert.match(styles, /--description-lg: 12px;/)
  assert.match(styles, /\.section-heading > p,[\s\S]*font-size: var\(--description-lg\);/)
  assert.match(styles, /\.top-nav-menu small,[\s\S]*font-size: var\(--description-md\);/)
  assert.match(styles, /\.agent-citations button small,[\s\S]*font-size: var\(--description-sm\);/)
  assert.match(qnaApp, /Q&amp;A 게시판<\/h2>[\s\S]*text-\[12px\][^>]*>질문을 등록하고 담당자와 답변을 이어가세요/)
  assert.match(qnaApp, /DialogDescription[^>]*text-\[12px\][^>]*>공정·부서와 질문 유형을 선택/)
})
