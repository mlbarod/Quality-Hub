import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const agentConfig = await readFile(new URL("../.codex/agents/design-reviewer.toml", import.meta.url), "utf8")
const repositoryInstructions = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8")
const designReviewRole = await readFile(new URL("../docs/DESIGN_REVIEW_AGENT.md", import.meta.url), "utf8")

test("영구 디자인 전문 검토 에이전트를 읽기 전용 프로젝트 설정으로 제공한다", () => {
  assert.match(agentConfig, /^name = "design_reviewer"$/m)
  assert.match(agentConfig, /^description = ".+"$/m)
  assert.match(agentConfig, /^sandbox_mode = "read-only"$/m)
  assert.match(agentConfig, /^model_reasoning_effort = "high"$/m)
  assert.doesNotMatch(agentConfig, /^model = /m)
  assert.match(agentConfig, /^developer_instructions = """$/m)
  assert.match(agentConfig, /코드, 설정, 문서와 테스트를 수정하지 않는다/)
  assert.match(agentConfig, /1366x768, 1440x900, 1920x1080/)
  assert.match(agentConfig, /prefers-reduced-motion: reduce/)
  assert.match(agentConfig, /저장소 보고서는 직접 만들지 않고 구조화된 결과를 메인 개발자에게 반환한다/)
})

test("저장소 지침과 역할 문서가 영구 에이전트 사용 계약을 연결한다", () => {
  assert.match(repositoryInstructions, /\.codex\/agents\/design-reviewer\.toml/)
  assert.match(repositoryInstructions, /커스텀 에이전트 `design_reviewer`를 우선 사용/)
  assert.match(designReviewRole, /프로젝트 커스텀 에이전트 이름: `design_reviewer`/)
  assert.match(designReviewRole, /설정 파일: \[`.codex\/agents\/design-reviewer\.toml`\]/)
  assert.match(designReviewRole, /설정 파일의 존재는 에이전트 도입만 의미하며 실제 검토 완료를 의미하지 않는다/)
})
