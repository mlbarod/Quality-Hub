import assert from "node:assert/strict"
import { once } from "node:events"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  builtStaticDir,
  createQualityHubServer,
  getRuntimeReadiness,
  loadServerEnvironment,
  parsePort,
  resolvePort,
  resolveServeMode,
  resolveStaticPath,
  sourceStaticDir,
} from "../server.mjs"

const viteConfigSource = await readFile(new URL("../vite.config.mjs", import.meta.url), "utf8")

async function startTestServer() {
  const server = createQualityHubServer({ staticDir: sourceStaticDir })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")

  const address = server.address()
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
}

async function closeTestServer(server) {
  const closed = once(server, "close")
  server.close()
  server.closeIdleConnections?.()
  await closed
}

test("PORT는 유효한 포트 번호만 허용한다", () => {
  assert.equal(parsePort("4173"), 4173)
  assert.equal(parsePort("5500"), 5500)
  assert.throws(() => parsePort("0"), /between 1 and 65535/)
  assert.throws(() => parsePort("65536"), /between 1 and 65535/)
  assert.throws(() => parsePort("abc"), /between 1 and 65535/)
})

test("명령행에서 5500 포트를 선택할 수 있다", () => {
  assert.equal(resolvePort(["--port", "5500"], "4173"), 5500)
  assert.equal(resolvePort(["--port=5500"], "4173"), 5500)
  assert.equal(resolvePort([], "4173"), 4173)
  assert.throws(() => resolvePort(["--port"], "4173"), /between 1 and 65535/)
})

test("정적 경로가 prototype 밖으로 벗어나지 못한다", () => {
  assert.equal(resolveStaticPath("/%2e%2e/README.md", sourceStaticDir).forbidden, true)
  assert.equal(resolveStaticPath("/%E0%A4%A", sourceStaticDir).badRequest, true)
})

test("실행용 정적 서버는 Vite 빌드 산출물을 기본으로 제공한다", () => {
  assert.equal(resolveStaticPath("/index.html").filePath, `${builtStaticDir}/index.html`)
})

test("server.mjs는 기본적으로 빌드 결과를 제공하고 개발 모드는 명시적으로 선택한다", () => {
  assert.equal(resolveServeMode([]), "built")
  assert.equal(resolveServeMode(["--built"]), "built")
  assert.equal(resolveServeMode(["--source"]), "source")
  assert.throws(() => resolveServeMode(["--source", "--built"]), /cannot be used together/)
})

test("실행 위치와 관계없이 프로젝트 루트 환경파일을 읽는다", () => {
  const loaded = []
  const loadedFiles = loadServerEnvironment({
    environmentFiles: [".env.rag.example", ".env-does-not-exist"],
    loadFile(filePath) {
      loaded.push(filePath)
    },
  })

  assert.deepEqual(loadedFiles, loaded)
  assert.equal(loaded.length, 1)
  assert.match(loaded[0], /\/Quality-Hub\/\.env\.rag\.example$/)
})

test("프로젝트 루트 환경파일 값이 서버 프로세스의 오래된 값을 대체한다", () => {
  const previous = process.env.RAG_API_URL
  process.env.RAG_API_URL = "stale-process-value"
  try {
    loadServerEnvironment({ environmentFiles: [".env.rag.example"] })
    assert.equal(process.env.RAG_API_URL, "")
  } finally {
    if (previous === undefined) delete process.env.RAG_API_URL
    else process.env.RAG_API_URL = previous
  }
})

test("외부 개발 도메인을 Vite 서버에서 허용한다", () => {
  assert.match(viteConfigSource, /allowedHosts:\s*\[[^\]]*"sanghyun--sanghyun-dev\.cdep1\.samsungds\.net"/s)
})

test("메인 화면과 정적 자산을 제공한다", async (t) => {
  const { server, baseUrl } = await startTestServer()
  t.after(() => closeTestServer(server))

  const indexResponse = await fetch(`${baseUrl}/`)
  assert.equal(indexResponse.status, 200)
  assert.match(indexResponse.headers.get("content-type"), /^text\/html/)
  assert.equal(indexResponse.headers.get("x-content-type-options"), "nosniff")
  assert.match(indexResponse.headers.get("content-security-policy"), /default-src 'self'/)
  assert.match(indexResponse.headers.get("content-security-policy"), /style-src[^;]+https:\/\/cdn\.jsdelivr\.net[^;]+https:\/\/fonts\.googleapis\.com/)
  assert.match(indexResponse.headers.get("content-security-policy"), /font-src[^;]+https:\/\/fonts\.gstatic\.com/)
  assert.equal(indexResponse.headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=()")
  assert.match(await indexResponse.text(), /<title>Quality Hub<\/title>/)

  const cssResponse = await fetch(`${baseUrl}/styles.css`)
  assert.equal(cssResponse.status, 200)
  assert.match(cssResponse.headers.get("content-type"), /^text\/css/)
})

test("컨테이너 헬스체크 경로는 Backend 연결 없이 응답한다", async (t) => {
  const { server, baseUrl } = await startTestServer()
  t.after(() => closeTestServer(server))

  const response = await fetch(`${baseUrl}/healthz`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.deepEqual(await response.json(), { status: "ok" })

  const headResponse = await fetch(`${baseUrl}/healthz`, { method: "HEAD" })
  assert.equal(headResponse.status, 200)
  assert.equal(await headResponse.text(), "")

  const postResponse = await fetch(`${baseUrl}/healthz`, { method: "POST" })
  assert.equal(postResponse.status, 405)
  assert.equal(postResponse.headers.get("allow"), "GET, HEAD")
})

test("운영 준비 상태는 필수 Backend 설정의 입력 여부를 구분한다", async (t) => {
  assert.deepEqual(getRuntimeReadiness({}), {
    ready: false,
    components: { database: "not_configured", rag: "not_configured", gptOss: "not_configured", sso: "disabled" },
  })

  const configuredEnvironment = {
    DB_HOST: "db.internal",
    DB_USER: "quality-hub",
    DB_PASSWORD: "secret",
    DB_NAME: "quality_hub",
    RAG_API_URL: "https://rag.internal/search",
    PASS_KEY: "pass-key",
    RAG_KEY: "rag-key",
    INDEX_NAME: "quality",
    GPT_OSS_API_URL: "https://gpt.internal/v1",
    GPT_OSS_CREDENTIAL_KEY: "credential",
    GPT_OSS_SYSTEM_NAME: "quality-hub",
    GPT_OSS_USER_ID: "quality-hub",
  }
  assert.equal(getRuntimeReadiness(configuredEnvironment).ready, true)

  const server = createQualityHubServer({ staticDir: sourceStaticDir, environment: configuredEnvironment })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(() => closeTestServer(server))
  const address = server.address()
  const response = await fetch(`http://127.0.0.1:${address.port}/readyz`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    status: "ready",
    components: { database: "configured", rag: "configured", gptOss: "configured", sso: "disabled" },
  })
})

test("HEAD, 미존재 경로와 허용하지 않는 메서드를 처리한다", async (t) => {
  const { server, baseUrl } = await startTestServer()
  t.after(() => closeTestServer(server))

  const headResponse = await fetch(`${baseUrl}/app.js`, { method: "HEAD" })
  assert.equal(headResponse.status, 200)
  assert.equal(await headResponse.text(), "")

  assert.equal((await fetch(`${baseUrl}/missing`)).status, 404)

  const postResponse = await fetch(`${baseUrl}/`, { method: "POST" })
  assert.equal(postResponse.status, 405)
  assert.equal(postResponse.headers.get("allow"), "GET, HEAD")
})

test("SSO 모드는 미인증 화면을 로그인으로 보내고 서버 사용자·역할을 HTML과 API에 강제한다", async (t) => {
  let principal = null
  let observedUserId = null
  let reportCalls = 0
  const authApi = {
    enabled: true,
    async handle() { return false },
    async authenticate() { return principal },
    async close() {},
  }
  const reportApi = {
    async handle(req, res) {
      if (!req.url?.startsWith("/api/reports")) return false
      reportCalls += 1
      observedUserId = req.headers["x-quality-hub-user-id"]
      const body = JSON.stringify({ reports: [] })
      res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) })
      res.end(body)
      return true
    },
    async close() {},
  }
  const inertApi = { async handle() { return false }, async close() {} }
  const server = createQualityHubServer({ staticDir: sourceStaticDir, authApi, reportApi, agentApi: inertApi, ruleSopApi: inertApi })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(() => closeTestServer(server))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`

  const redirectResponse = await fetch(`${baseUrl}/`, { redirect: "manual" })
  assert.equal(redirectResponse.status, 302)
  assert.equal(redirectResponse.headers.get("location"), "/auth/login?returnTo=%2F")

  const faviconResponse = await fetch(`${baseUrl}/favicon.ico`, { redirect: "manual" })
  assert.equal(faviconResponse.status, 204)
  assert.equal(faviconResponse.headers.get("location"), null)

  principal = {
    userId: "server.identity",
    displayName: "서버 사용자",
    department: "품질관리",
    role: "general",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  }
  const indexResponse = await fetch(`${baseUrl}/`)
  const index = await indexResponse.text()
  assert.match(index, /data-auth-mode="sso"/)
  assert.match(index, /data-current-role="general"/)

  const reportResponse = await fetch(`${baseUrl}/api/reports`, { headers: { "x-quality-hub-user-id": "browser.spoof" } })
  assert.equal(reportResponse.status, 200)
  assert.equal(observedUserId, "server.identity")

  const deniedResponse = await fetch(`${baseUrl}/api/reports`, { method: "POST" })
  assert.equal(deniedResponse.status, 403)
  assert.equal(reportCalls, 1)
})
