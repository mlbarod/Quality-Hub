import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const phase1Memo = await readFile(new URL("../docs/PHASE1_REMAINING_TASKS.md", import.meta.url), "utf8")

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
    /data-rule-card[^>]*data-rule-major="([^"]+)" data-rule-middle="([^"]+)" data-rule-minor="([^"]+)"/g,
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

test("관리자는 빈 카드에서 문서를 등록하고 카드 상세에서 조회·수정·삭제한다", () => {
  const cardGrid = html.match(/<div class="rule-card-grid"[^>]*>([\s\S]*?)<\/div>\s*<template data-rule-card-template>/)?.[1] ?? ""

  assert.match(html, /data-can-manage-rules="true"/)
  assert.match(html, /class="rule-document-create-card rule-admin-only"[^>]*data-rule-create-open/)
  assert.ok(cardGrid.lastIndexOf("data-rule-create-open") > cardGrid.lastIndexOf("data-rule-card "))
  assert.match(html, /data-rule-detail-dialog/)
  assert.match(html, /data-rule-view/)
  assert.match(html, /data-rule-edit-open/)
  assert.match(html, /data-rule-delete-open/)
  assert.match(html, /data-rule-editor-dialog/)
  assert.match(html, /data-rule-delete-dialog/)
  assert.match(script, /let canManageRuleDocuments = prototype\?\.dataset\.canManageRules === "true"/)
  assert.match(script, /document\.body\.classList\.toggle\("rule-manager", canManageRuleDocuments\)/)
  assert.match(script, /ruleCardGrid\?\.addEventListener\("click"/)
  assert.match(script, /ruleEditorForm\?\.addEventListener\("submit"/)
  assert.match(script, /softDeleteItem\(\{ type: "Rule&SOP"/)
})

test("등록·수정 분류는 대분류부터 담당 공정까지 드릴다운하고 URL 컬럼을 보관한다", () => {
  assert.match(html, /data-rule-editor-major/)
  assert.match(html, /data-rule-editor-middle/)
  assert.match(html, /data-rule-editor-minor/)
  assert.match(html, /data-rule-editor-process/)
  assert.match(html, /type="url"[^>]*data-rule-editor-url/)
  assert.match(html, /data-rule-card[^>]*data-rule-process="[^"]+"[^>]*data-rule-url="[^"]+"/)
  assert.match(script, /const ruleMiddleByMajor/)
  assert.match(script, /const ruleMinorByMiddle/)
  assert.match(script, /const ruleProcessesByMinor/)
  assert.match(script, /card\.dataset\.ruleUrl = ruleEditorUrl\.value\.trim\(\)/)
})

test("카드 상세 팝업에 개정 이력을 누적하되 이전 버전 조회는 제공하지 않는다", () => {
  assert.match(html, /data-rule-revision-list/)
  assert.match(html, /이전 버전 원문 조회는 제공하지 않습니다\./)
  assert.match(script, /const ruleRevisionHistory = new Map\(\)/)
  assert.match(script, /revisions\.unshift\(/)
  assert.doesNotMatch(html, /data-rule-previous-version-view/)
})

test("1단계 문서에 Rule&SOP 설계 완료와 실제 DB 연동 경계를 기록한다", () => {
  assert.match(phase1Memo, /\[x\] 마스터·관리자 전용 신규 등록 카드와 등록·수정·삭제 팝업 흐름/)
  assert.match(phase1Memo, /\[x\] 대분류·중분류·소분류·담당 공정 드릴다운 설정 흐름/)
  assert.match(phase1Memo, /이전 버전 조회 미제공 원칙 확정/)
  assert.match(phase1Memo, /Rule&SOP 분류·원문 URL의 실제 DB 연동과 운영 저장/)
  assert.match(phase1Memo, /1단계 UI\/UX 설계를 종료한다/)
})
