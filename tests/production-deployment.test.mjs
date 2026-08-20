import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [dockerfile, cdepDockerfile, dockerignore, compose, composeEnvExample, gitignore, packageJson, readme, operations, requirements, developmentPlan] = await Promise.all([
  readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  readFile(new URL("../docker/Dockerfile-prod", import.meta.url), "utf8"),
  readFile(new URL("../.dockerignore", import.meta.url), "utf8"),
  readFile(new URL("../compose.yaml", import.meta.url), "utf8"),
  readFile(new URL("../.env.compose.example", import.meta.url), "utf8"),
  readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/OPERATIONS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/QUALITY_PORTAL_REQUIREMENTS.md", import.meta.url), "utf8"),
  readFile(new URL("../docs/DEVELOPMENT_PLAN.md", import.meta.url), "utf8"),
])

test("운영 기본 실행과 개발용 Vite 실행을 분리한다", () => {
  assert.equal(packageJson.scripts.start, "node server.mjs")
  assert.match(packageJson.scripts.dev, /server\.mjs --source/)
  assert.match(packageJson.scripts["start:static"], /npm run build/)
  assert.match(packageJson.scripts.test, /--test-concurrency=1/)
})

test("운영 이미지는 다단계 빌드와 비루트 런타임을 사용한다", () => {
  assert.match(dockerfile, /FROM node:22\.22\.1-bookworm-slim AS dependencies/)
  assert.match(dockerfile, /FROM dependencies AS build/)
  assert.match(dockerfile, /npm ci --omit=dev/)
  assert.match(dockerfile, /COPY --chown=node:node --from=build \/app\/dist \.\/dist/)
  assert.match(dockerfile, /USER node/)
  assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/healthz/)
  assert.doesNotMatch(dockerfile, /COPY \. \./)
})

test("C-DEP 이미지는 개발용 env 파일 없이 Vite 공개 설정을 빌드 인자로 받는다", () => {
  assert.match(cdepDockerfile, /ARG VITE_QNA_LINE_CATEGORIES=""/)
  assert.match(cdepDockerfile, /ENV VITE_QNA_LINE_CATEGORIES=\$\{VITE_QNA_LINE_CATEGORIES\}/)
  assert.doesNotMatch(cdepDockerfile, /COPY prototype\/\.env\.local/)
  assert.match(cdepDockerfile, /COPY prototype \.\/prototype/)
})

test("Compose는 앱을 loopback에 제한하고 읽기 전용으로 실행한다", () => {
  assert.match(compose, /QUALITY_HUB_BIND_ADDRESS:-127\.0\.0\.1/)
  assert.match(compose, /restart: unless-stopped/)
  assert.match(compose, /read_only: true/)
  assert.match(compose, /no-new-privileges:true/)
  assert.match(compose, /cap_drop:\s*\n\s*- ALL/)
  assert.match(compose, /- \.env\.rag\s*\n\s*- \.env\.gpt-oss\s*\n\s*- \.env\.db/)
})

test("운영 비밀정보와 빌드 컨텍스트 경계를 유지한다", () => {
  assert.match(dockerignore, /^\.env\*$/m)
  assert.match(dockerignore, /^prototype\/\.env\.local$/m)
  assert.match(gitignore, /^\.env\.compose$/m)
  assert.match(composeEnvExample, /VITE_QNA_LINE_CATEGORIES=/)
  assert.doesNotMatch(composeEnvExample, /PASSWORD=|CREDENTIAL_KEY=|PASS_KEY=/)
})

test("운영 절차와 미완료 범위를 문서화한다", () => {
  assert.match(readme, /\[운영 배포 가이드\]\(docs\/OPERATIONS\.md\)/)
  assert.match(operations, /시범 운영/)
  assert.match(operations, /브라우저의 로컬 저장소/)
  assert.match(operations, /실제 사내 로그인과 운영 DB 적용/)
  assert.match(operations, /docker compose --env-file \.env\.compose up -d/)
  assert.match(operations, /\{"status":"ok"\}/)
  assert.match(operations, /\/readyz/)
  assert.match(requirements, /1차 시범 운영 예외/)
  assert.match(requirements, /사내망·허용 IP 제한과 역할 미리보기를 유지/)
  assert.match(developmentPlan, /미완료 단계는 운영 중 순차 진행/)
  assert.match(developmentPlan, /실제 운영 서버 배포 미완료/)
})
