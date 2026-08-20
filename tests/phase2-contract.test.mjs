import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  canDeleteQuestion,
  canEditQna,
  getPermissionMessage,
  getRolePolicy,
  ROLE_OPTIONS,
} from "../prototype/src/mock/phase2.js"

const html = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8")
const script = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8")
const styles = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8")
const qnaApp = await readFile(new URL("../prototype/src/qna/QnaApp.jsx", import.meta.url), "utf8")

test("2단계 역할과 접근 차단 정책을 한 데이터 계약으로 제공한다", () => {
  assert.deepEqual(ROLE_OPTIONS.map(({ value }) => value), ["master", "admin", "general", "blocked"])
  assert.equal(getRolePolicy("master").canManagePermissions, true)
  assert.equal(getRolePolicy("admin").canManageContent, true)
  assert.equal(getRolePolicy("admin").canManagePermissions, false)
  assert.equal(getRolePolicy("general").canManageContent, false)
  assert.equal(getRolePolicy("blocked").canAccess, false)
  assert.match(getPermissionMessage("admin"), /마스터에게 문의/)
  assert.match(getPermissionMessage("general"), /관리자에게 문의/)
})

test("Q&A 수정·삭제 정책이 역할, 작성자와 답변 존재 여부를 구분한다", () => {
  const unanswered = { author: "김품질", messages: [] }
  const answered = { author: "김품질", messages: [{ id: "answer" }] }
  assert.equal(canEditQna("general", "김품질", "김품질"), true)
  assert.equal(canEditQna("general", "김품질", "다른사용자"), false)
  assert.equal(canDeleteQuestion("general", "김품질", unanswered), true)
  assert.equal(canDeleteQuestion("general", "김품질", answered), false)
  assert.equal(canDeleteQuestion("master", "마스터", answered), true)
})

test("역할 미리보기와 접근 차단 정책을 화면에서 체험할 수 있다", () => {
  assert.match(html, /data-role-preview/)
  assert.match(html, /data-access-blocked/)
  assert.match(html, /<main class="access-blocked"[^>]*tabindex="-1"/)
  assert.match(script, /applyRole/)
})

test("상단 사용자 버튼은 계정 정보 팝업을 열고 SSO 로그아웃을 팝업 안에 제공한다", () => {
  const profileTrigger = html.match(/<button class="header-profile"[^>]*>/)?.[0] ?? ""
  assert.match(profileTrigger, /data-profile-trigger/)
  assert.match(profileTrigger, /aria-haspopup="dialog"/)
  assert.match(profileTrigger, /aria-expanded="false"/)
  assert.match(html, /data-profile-popover/)
  assert.match(html, /data-profile-user-id/)
  assert.match(html, /data-profile-user-name/)
  assert.match(html, /data-profile-department/)
  assert.match(html, /data-profile-role/)
  assert.match(html, /data-profile-logout/)
  assert.match(script, /const setProfilePopoverOpen/)
  assert.match(script, /event\.key !== "Escape"/)
  assert.match(script, /profileLogout\.hidden = false/)
  assert.doesNotMatch(script, /button\.title = "통합인증 로그아웃"/)
  assert.match(styles, /\.header-profile-popover \{[\s\S]*width: 320px;/)
})

test("SSO 세션 만료 시 업무 API가 공통 재로그인 흐름을 사용한다", () => {
  assert.match(script, /createSessionAwareFetch/)
  assert.match(script, /const apiFetch = createSessionAwareFetch\(\{ isSsoMode \}\)/)
  assert.match(script, /createAgentChatController\(\{[\s\S]*fetchImpl: apiFetch/)
})

test("대시보드 예시 지표를 제거하고 실제 Spotfire 조회 상태를 제공한다", () => {
  assert.doesNotMatch(html, /data-common-state-preview|data-period=/)
  assert.match(html, /data-dashboard-spotfire-frame/)
  assert.match(script, /const loadDashboard = /)
})

test("숨김 삭제·복구·변경 이력과 마지막 마스터 보호 흐름을 제공한다", () => {
  assert.match(html, /data-recovery-open/)
  assert.match(html, /data-history-open/)
  assert.match(html, /data-master-row/)
  assert.match(script, /softDeleteItem/)
  assert.match(script, /restoreItem/)
  assert.match(script, /updateMasterProtection/)
})

test("기준선 접근성 보완 계약을 유지한다", () => {
  assert.match(html, /rel="icon"/)
  assert.match(html, /data-dashboard-shell/)
  assert.match(script, /suppressGlobalSearchFocusRestore/)
  assert.match(script, /syncPrimaryWorkspaceAccessibility/)
  assert.match(qnaApp, /aria-label="Q&A 현재 위치"/)
  assert.match(styles, /--faint-foreground:/)
  assert.match(styles, /data-current-role="blocked"/)
  assert.match(html, /<span class="sr-only">Rule&amp;SOP 제목 검색<\/span>/)
  assert.match(styles, /\.report-search:focus-within \{[^}]*box-shadow:/)
  assert.match(script, /if \(!currentRolePolicy\.canAccess \|\| !\(globalSearch instanceof HTMLDialogElement\)/)
})
