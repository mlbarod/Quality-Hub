import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { EventEmitter } from "node:events"
import test from "node:test"

import { authorizePrincipal, createAuthApi } from "../server/authApi.mjs"
import { hashOpaqueToken } from "../server/oidcService.mjs"

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const fixedNow = new Date("2030-01-01T00:00:00.000Z")
const sessionSecret = "test-session-secret-that-is-at-least-32-bytes"

function request({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
  const req = EventEmitter.on ? new EventEmitter() : null
  req.method = method
  req.url = url
  req.headers = { host: "quality.example", ...headers }
  req[Symbol.asyncIterator] = async function* iterator() {
    if (body) yield Buffer.from(body)
  }
  return req
}

function response() {
  return {
    statusCode: null,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; this.headers = headers },
    end(body = "") { this.body += body ?? "" },
  }
}

function signedToken({ nonce, code }) {
  const claims = {
    iss: "https://issuer.internal/adfs",
    sub: "subject-1234",
    aud: "quality-hub-client",
    exp: Math.floor(fixedNow.getTime() / 1000) + 3600,
    iat: Math.floor(fixedNow.getTime() / 1000) - 10,
    nonce,
    c_hash: createHash("sha256").update(code).digest().subarray(0, 16).toString("base64url"),
    employeeId: "employee.example",
    name: "품질 사용자",
    department: "품질관리",
  }
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  const input = `${header}.${payload}`
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`
}

function createRepository() {
  const transactions = new Map()
  const sessions = new Map()
  return {
    transactions,
    sessions,
    async bootstrapMasters() { return { initialized: false, count: 0 } },
    async createLoginTransaction(value) { transactions.set(value.stateHash, value) },
    async consumeLoginTransaction({ stateHash, correlationHash }) {
      const value = transactions.get(stateHash)
      if (!value || value.correlationHash !== correlationHash) return null
      transactions.delete(stateHash)
      return value
    },
    async createSession(value) { sessions.set(value.sessionHash, { ...value.identity, expiresAt: value.absoluteExpiresAt }) },
    async findSession(sessionHash) { return sessions.get(sessionHash) ?? null },
    async resolveRole() { return "general" },
    async revokeSession(sessionHash) { sessions.delete(sessionHash) },
    async listRules() { return [] },
    async listMasters() { return [] },
    async listPermissionHistory() { return [{ historyId: "history-1" }] },
    async close() {},
  }
}

function config(overrides = {}) {
  return {
    enabled: true,
    safeClaimTrace: false,
    clientId: "quality-hub-client",
    redirectUri: "https://quality.example/auth/callback",
    authorizeUrl: "https://issuer.internal/adfs/oauth2/authorize/",
    signoutUrl: "https://issuer.internal/adfs/ls/?wa=wsignoutcleanup1.0",
    certificatePath: "/not-used.cer",
    sessionSecret,
    expectedIssuer: "https://issuer.internal/adfs",
    userIdClaim: "employeeId",
    displayNameClaim: "name",
    departmentClaim: "department",
    bootstrapMasterUserIds: [],
    loginTransactionSeconds: 300,
    idleSeconds: 1800,
    absoluteSeconds: 28800,
    clockToleranceSeconds: 60,
    secureCookies: false,
    ...overrides,
  }
}

test("로그인부터 callback, 서버 세션 조회까지 브라우저 토큰을 노출하지 않는다", async () => {
  const repository = createRepository()
  const api = createAuthApi({ config: config(), repository, publicKey, now: () => fixedNow, logger: { error() {} } })
  const loginResponse = response()
  assert.equal(await api.handle(request({ url: "/auth/login?returnTo=%2Frules" }), loginResponse), true)
  assert.equal(loginResponse.statusCode, 302)
  const authorizeUrl = new URL(loginResponse.headers.Location)
  const state = authorizeUrl.searchParams.get("state")
  const nonce = authorizeUrl.searchParams.get("nonce")
  const correlationCookie = loginResponse.headers["Set-Cookie"][0].split(";", 1)[0]
  const code = "authorization-code"
  const form = new URLSearchParams({ state, code, id_token: signedToken({ nonce, code }) }).toString()
  const callbackResponse = response()
  await api.handle(request({
    method: "POST",
    url: "/auth/callback",
    headers: { cookie: correlationCookie, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  }), callbackResponse)
  assert.equal(callbackResponse.statusCode, 302)
  assert.equal(callbackResponse.headers.Location, "/rules")
  assert.doesNotMatch(JSON.stringify(callbackResponse.headers), /employee\.example|id_token/)

  const sessionCookie = callbackResponse.headers["Set-Cookie"][1].split(";", 1)[0]
  const authRequest = request({ headers: { cookie: sessionCookie } })
  const principal = await api.authenticate(authRequest)
  assert.equal(principal.userId, "employee.example")
  assert.equal(principal.role, "general")
})

test("Claim 확인 모드는 키 자료형만 기록하고 세션을 만들지 않는다", async () => {
  const repository = createRepository()
  const records = []
  const api = createAuthApi({
    config: config({ safeClaimTrace: true, expectedIssuer: "", userIdClaim: "", displayNameClaim: "", departmentClaim: "" }),
    repository,
    publicKey,
    now: () => fixedNow,
    logger: { info(message, value) { records.push({ message, value }) }, error() {} },
  })
  const loginResponse = response()
  await api.handle(request({ url: "/auth/login" }), loginResponse)
  const authorizeUrl = new URL(loginResponse.headers.Location)
  const code = "authorization-code"
  const callbackResponse = response()
  await api.handle(request({
    method: "POST",
    url: "/auth/callback",
    headers: {
      cookie: loginResponse.headers["Set-Cookie"][0].split(";", 1)[0],
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      state: authorizeUrl.searchParams.get("state"),
      code,
      id_token: signedToken({ nonce: authorizeUrl.searchParams.get("nonce"), code }),
    }).toString(),
  }), callbackResponse)
  assert.equal(callbackResponse.statusCode, 503)
  assert.equal(repository.sessions.size, 0)
  assert.equal(records[0].value.claimTypes.employeeId, "string")
  assert.equal(JSON.stringify(records).includes("employee.example"), false)
})

test("서버 권한 경계는 미인증, 차단 사용자와 일반 사용자의 변경 요청을 막는다", () => {
  assert.deepEqual(authorizePrincipal(null, request({ url: "/api/reports" })), { allowed: false, status: 401 })
  assert.deepEqual(authorizePrincipal({ role: "blocked" }, request({ url: "/api/reports" })), { allowed: false, status: 403 })
  assert.deepEqual(authorizePrincipal({ role: "general" }, request({ method: "POST", url: "/api/rules" })), { allowed: false, status: 403 })
  assert.deepEqual(authorizePrincipal({ role: "general" }, request({ method: "GET", url: "/api/rules" })), { allowed: true })
})

test("세션 저장 키는 원문 쿠키가 아닌 HMAC 값이다", () => {
  assert.notEqual(hashOpaqueToken("opaque-session", sessionSecret), "opaque-session")
  assert.equal(hashOpaqueToken("opaque-session", sessionSecret).length, 64)
})

test("마스터 권한 API는 같은 서비스 Origin만 허용하고 DB 이력을 반환한다", async () => {
  const api = createAuthApi({ config: config(), repository: createRepository(), publicKey, now: () => fixedNow, logger: { error() {} } })
  const historyRequest = request({ url: "/api/auth/permissions/history" })
  historyRequest.auth = { role: "master", userId: "master.user" }
  const historyResponse = response()
  await api.handle(historyRequest, historyResponse)
  assert.equal(historyResponse.statusCode, 200)
  assert.equal(JSON.parse(historyResponse.body).history[0].historyId, "history-1")

  const mutationRequest = request({ method: "POST", url: "/api/auth/permissions", body: "{}", headers: { "content-type": "application/json" } })
  mutationRequest.auth = { role: "master", userId: "master.user" }
  const mutationResponse = response()
  await api.handle(mutationRequest, mutationResponse)
  assert.equal(mutationResponse.statusCode, 403)
  assert.equal(JSON.parse(mutationResponse.body).error.code, "ORIGIN_REQUIRED")
})
