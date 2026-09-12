import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
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
  assert.match(dockerfile, /COPY prototype\/\.env\.local \.\/prototype\/\.env\.local/)
  assert.doesNotMatch(dockerfile, /ARG VITE_QNA_LINE_CATEGORIES|ENV VITE_QNA_LINE_CATEGORIES/)
  assert.doesNotMatch(dockerfile, /COPY \. \./)
})

test("C-DEP 이미지는 필수 환경파일을 변경하지 않고 지정 경로에 복사한다", () => {
  assert.doesNotMatch(cdepDockerfile, /ARG VITE_QNA_LINE_CATEGORIES|ENV VITE_QNA_LINE_CATEGORIES/)
  assert.match(cdepDockerfile, /COPY prototype \.\/prototype/)
  assert.match(cdepDockerfile, /COPY prototype\/\.env\.local \.\/prototype\/\.env\.local/)
  for (const fileName of ["db", "rag", "gpt-oss", "sso", "mail"]) {
    assert.match(cdepDockerfile, new RegExp(`COPY[^\\n]*\\.env\\.${fileName} \\.\\/`))
  }
})

test("두 이미지의 빌드 단계는 프론트엔드에서 사용하는 서버 공통 모듈을 포함한다", async () => {
  const sourceRoot = new URL("../prototype/src/", import.meta.url)
  const files = (await readdir(sourceRoot, { recursive: true }))
    .filter((file) => /\.(?:js|jsx)$/.test(file) && !file.includes(".test."))
  const sharedModules = new Set()
  for (const file of files) {
    const source = await readFile(new URL(file, sourceRoot), "utf8")
    for (const match of source.matchAll(/from\s+["'](?:\.\.\/)+server\/([^"']+)["']/g)) {
      sharedModules.add(`server/${match[1]}`)
    }
  }
  assert.ok(sharedModules.size > 0)
  for (const [name, recipe] of [["Dockerfile", dockerfile], ["Dockerfile-prod", cdepDockerfile]]) {
    const buildStage = recipe.split("FROM dependencies AS build")[1].split("RUN npm run build")[0]
    const copiedSources = buildStage.split("\n").filter((line) => line.startsWith("COPY "))
      .flatMap((line) => line.trim().split(/\s+/).slice(1, -1))
    for (const module of sharedModules) {
      assert.ok(copiedSources.includes(module), `${name} 빌드 단계에 ${module} 복사가 필요합니다.`)
    }
  }
})

test("Compose는 앱을 loopback에 제한하고 읽기 전용으로 실행한다", () => {
  assert.match(compose, /QUALITY_HUB_BIND_ADDRESS:-127\.0\.0\.1/)
  assert.match(compose, /restart: unless-stopped/)
  assert.match(compose, /read_only: true/)
  assert.match(compose, /no-new-privileges:true/)
  assert.match(compose, /cap_drop:\s*\n\s*- ALL/)
  assert.match(compose, /- \.env\.rag\s*\n\s*- \.env\.gpt-oss\s*\n\s*- \.env\.db/)
  assert.doesNotMatch(compose, /VITE_QNA_LINE_CATEGORIES/)
})

test("필수 운영 환경파일은 Git에서 제외하고 Docker 빌드 컨텍스트에 포함한다", () => {
  assert.match(dockerignore, /^\.env\*$/m)
  for (const fileName of ["db", "rag", "gpt-oss", "sso", "mail"]) {
    assert.match(dockerignore, new RegExp(`^!\\.env\\.${fileName}$`, "m"))
    assert.match(gitignore, new RegExp(`^\\.env\\.${fileName}$`, "m"))
  }
  assert.match(dockerignore, /^!prototype\/\.env\.local$/m)
  assert.match(gitignore, /^prototype\/\.env\.local$/m)
  assert.match(gitignore, /^\.env\.compose$/m)
  assert.doesNotMatch(composeEnvExample, /VITE_QNA_LINE_CATEGORIES=/)
  assert.doesNotMatch(composeEnvExample, /PASSWORD=|CREDENTIAL_KEY=|PASS_KEY=/)
})

test("운영 절차와 미완료 범위를 문서화한다", () => {
  assert.match(readme, /\[운영 배포 가이드\]\(docs\/OPERATIONS\.md\)/)
  assert.match(operations, /시범 운영/)
  assert.match(operations, /Q&A 질문·답변·태그·알림·변경 이력은 Backend API와 DB 테이블에 저장/)
  assert.match(operations, /실제 사내 로그인과 운영 DB CRUD/)
  assert.match(operations, /docker compose --env-file \.env\.compose up -d/)
  assert.match(operations, /필수 환경파일/)
  assert.match(operations, /파일 내용을 생성·수정·덮어쓰지 않고/)
  assert.match(operations, /\{"status":"ok"\}/)
  assert.match(operations, /\/readyz/)
  assert.match(requirements, /1차 시범 운영 예외/)
  assert.match(requirements, /사내망·허용 IP 제한과 역할 미리보기를 유지/)
  assert.match(developmentPlan, /미완료 단계는 운영 중 순차 진행/)
  assert.match(developmentPlan, /실제 운영 서버 배포 미완료/)
})
