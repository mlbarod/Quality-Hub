import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  buildQnaSearchText,
  buildTitleSearchText,
  htmlToSearchText,
  matchesSearchQuery,
} from "../prototype/src/search/globalSearch.js"

const requirements = await readFile(new URL("../docs/QUALITY_PORTAL_REQUIREMENTS.md", import.meta.url), "utf8")
const app = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")

test("Report와 Rule&SOP는 제목만 검색하고 여러 단어의 위치와 순서를 허용한다", () => {
  const reportTitle = buildTitleSearchText("AOI 검사 분석")
  const ruleTitle = buildTitleSearchText("예시 Rule 문서 A-01")

  assert.equal(matchesSearchQuery(reportTitle, "분석 AOI"), true)
  assert.equal(matchesSearchQuery(ruleTitle, "예시 A-01"), true)
  assert.equal(matchesSearchQuery(reportTitle, "VM"), false)
  assert.equal(matchesSearchQuery(ruleTitle, "식각"), false)
})

test("Q&A는 제목, 본문과 숨김 처리되지 않은 답변·댓글을 검색한다", () => {
  const searchText = buildQnaSearchText({
    title: "장비 점검 기준 문의",
    author: "김품질",
    content: "<p>검사 시작 시점을 확인해 주세요.</p>",
    messages: [
      { body: "개인정보 보존 기준도 함께 검토합니다." },
      { body: "삭제된 비밀 댓글", hidden: true },
    ],
  })

  assert.equal(matchesSearchQuery(searchText, "장비 시점"), true)
  assert.equal(matchesSearchQuery(searchText, "개인정보"), true)
  assert.equal(matchesSearchQuery(searchText, "김품질"), false)
  assert.equal(matchesSearchQuery(searchText, "비밀"), false)
})

test("HTML 본문은 태그가 아닌 화면에 보이는 텍스트로 검색한다", () => {
  const searchText = htmlToSearchText('<p>세정액 <strong>교체</strong></p><script>비공개코드</script>')

  assert.equal(matchesSearchQuery(searchText, "세정액 교체"), true)
  assert.equal(matchesSearchQuery(searchText, "strong"), false)
  assert.equal(matchesSearchQuery(searchText, "비공개코드"), false)
})

test("통합 검색 대상과 역할 공통 결과 계약을 요구사항에 기록한다", () => {
  assert.match(requirements, /각종 Report 조회와 Rule&SOP의 검색 대상은 게시글 제목으로 제한/)
  assert.match(requirements, /Q&A의 검색 대상은 게시글 제목, 질문 본문과 숨김 처리되지 않은 답변·댓글 내용/)
  assert.match(requirements, /입력한 모든 단어를 검색 대상 내용에 포함한 게시글/)
  assert.match(requirements, /마스터·관리자·일반유저 사이에는 통합 검색 결과 차등을 두지 않음/)
})

test("통합 검색을 열 때 현재 저장 데이터에서 결과를 다시 구성한다", () => {
  assert.match(app, /if \(globalSearchInput instanceof HTMLInputElement\) globalSearchInput\.value = "";\s+syncGlobalSearchResults\(\);\s+globalSearch\.showModal\(\);/)
})
