import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [html, appSource, chatControllerSource, answerFormatterSource, serverSource, apiSource, packageSource, requirements] = await Promise.all([
  readFile(new URL("../prototype/index.html", import.meta.url), "utf8"),
  readFile(new URL("../prototype/app.js", import.meta.url), "utf8"),
  readFile(new URL("../prototype/src/agent/chatController.js", import.meta.url), "utf8"),
  readFile(new URL("../prototype/src/agent/answerFormatter.js", import.meta.url), "utf8"),
  readFile(new URL("../server.mjs", import.meta.url), "utf8"),
  readFile(new URL("../server/agentChatApi.mjs", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../docs/QUALITY_PORTAL_REQUIREMENTS.md", import.meta.url), "utf8"),
])

test("중앙 Agent 팝업과 전체 화면이 같은 작업 공간과 대화 렌더링 지점을 사용한다", () => {
  assert.match(html, /data-agent-backdrop|class="agent-backdrop"/)
  assert.match(html, /role="dialog"[^>]*aria-modal="false"[^>]*data-agent-workspace[^]*data-agent-full-thread/)
  assert.match(html, /data-agent-history-list/)
  assert.doesNotMatch(html, /data-agent-context-sources|data-agent-sources-refresh/)
  assert.match(html, /data-agent-new/)
  assert.match(html, /data-agent-expand[^]*data-agent-collapse[^]*data-agent-close/)
  assert.match(appSource, /const setAgentMode =/)
  assert.match(appSource, /agentWorkspace\?\.setAttribute\("aria-hidden", String\(mode === "closed"\)\)/)
  assert.match(appSource, /agentWorkspace\?\.setAttribute\("aria-modal", String\(mode === "drawer"\)\)/)
  assert.match(appSource, /prototype\.dataset\.agentMode !== "closed"/)
  assert.match(appSource, /createAgentChatController/)
  assert.doesNotMatch(appSource, /실제 답변 생성은 사내 품질 Agent API 연동 후/)
})

test("대화 텍스트는 HTML 직접 삽입 없이 안전한 DOM API로 렌더링한다", () => {
  assert.match(chatControllerSource, /createFormattedAnswer\(message\.content\)/)
  assert.doesNotMatch(chatControllerSource, /data-agent-source|sourceTitle|renderSources/)
  assert.match(answerFormatterSource, /document\.createTextNode/)
  assert.match(answerFormatterSource, /document\.createElement\("table"\)/)
  assert.doesNotMatch(`${chatControllerSource}\n${answerFormatterSource}`, /\.innerHTML\s*=/)
})

test("conversation CRUD와 Backend Chat API를 source·built 서버에서 함께 제공한다", () => {
  assert.match(apiSource, /\/api\/agent/)
  assert.match(apiSource, /listConversations/)
  assert.match(apiSource, /createConversation/)
  assert.match(apiSource, /listMessages/)
  assert.match(apiSource, /deleteConversation/)
  assert.match(apiSource, /activeService\.ask/)
  assert.match(serverSource, /agentApi\.handle/)
  assert.match(packageSource, /"start": "node server\.mjs"/)
})

test("SSO 세션 user ID와 비활성화 테스트 경계, Streaming 제외를 요구사항에 기록한다", () => {
  assert.match(requirements, /SSO 비활성화 시에만 역할 미리보기의 user ID를 테스트 식별값으로 사용/)
  assert.match(requirements, /Streaming은 적용하지 않음/)
})
