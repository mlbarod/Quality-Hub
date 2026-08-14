import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import test from "node:test"

import {
  createOidcLoginRequest,
  loadOidcConfig,
  mapIdentityClaims,
  normalizeReturnTo,
  verifyIdToken,
} from "../server/oidcService.mjs"

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })

function jwt(claims, header = { alg: "RS256", typ: "JWT" }) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url")
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  const input = `${encodedHeader}.${encodedPayload}`
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`
}

function baseClaims({ code = "authorization-code", nonce = "nonce-value" } = {}) {
  return {
    iss: "https://issuer.internal/adfs",
    sub: "subject-1234",
    aud: "quality-hub-client",
    exp: 2_000_000_000,
    iat: 1_999_999_000,
    nonce,
    c_hash: createHash("sha256").update(code).digest().subarray(0, 16).toString("base64url"),
    employeeId: "employee.example",
    name: "품질 사용자",
    department: "품질관리",
  }
}

test("SSO가 꺼져 있으면 추가 환경변수 없이 기존 모드를 유지한다", () => {
  assert.deepEqual(loadOidcConfig({ SSO_ENABLED: "false" }), { enabled: false })
})

test("SSO 설정은 필수값과 보안 기본값을 구분한다", () => {
  const environment = {
    SSO_ENABLED: "true",
    SSO_SAFE_CLAIM_TRACE: "true",
    SSO_CLIENT_ID: "quality-hub-client",
    SSO_REDIRECT_URI: "https://quality.example/auth/callback",
    SSO_CERTIFICATE_PATH: "/run/secrets/idp.cer",
    SSO_SESSION_SECRET: "a".repeat(32),
  }
  const config = loadOidcConfig(environment)
  assert.equal(config.idleSeconds, 1800)
  assert.equal(config.absoluteSeconds, 28800)
  assert.equal(config.safeClaimTrace, true)
  assert.match(config.authorizeUrl, /^https:\/\/stsds\.secsso\.net\//)
  assert.throws(() => loadOidcConfig({ ...environment, SSO_SAFE_CLAIM_TRACE: "false" }), /SSO_EXPECTED_ISSUER/)
  assert.throws(() => loadOidcConfig({ ...environment, SSO_SESSION_SECRET: "short" }), /32바이트/)
})

test("로그인 URL은 form_post hybrid flow와 state, nonce를 포함한다", () => {
  const request = createOidcLoginRequest({
    authorizeUrl: "https://issuer.internal/adfs/oauth2/authorize/",
    clientId: "quality-hub-client",
    redirectUri: "https://quality.example/auth/callback",
  }, { returnTo: "/rules?major=A" })
  const url = new URL(request.url)
  assert.equal(url.searchParams.get("response_mode"), "form_post")
  assert.equal(url.searchParams.get("response_type"), "code id_token")
  assert.equal(url.searchParams.get("scope"), "openid profile")
  assert.equal(url.searchParams.get("state"), request.state)
  assert.equal(url.searchParams.get("nonce"), request.nonce)
})

test("RS256 ID token의 서명, issuer, audience, 만료, nonce와 c_hash를 검증한다", () => {
  const claims = baseClaims()
  const verified = verifyIdToken(jwt(claims), {
    publicKey,
    clientId: "quality-hub-client",
    issuer: "https://issuer.internal/adfs",
    nonce: "nonce-value",
    code: "authorization-code",
    nowSeconds: 1_999_999_500,
  })
  assert.equal(verified.employeeId, "employee.example")

  assert.throws(() => verifyIdToken(jwt({ ...claims, aud: "other-client" }), {
    publicKey, clientId: "quality-hub-client", issuer: claims.iss, nonce: claims.nonce, code: "authorization-code", nowSeconds: 1_999_999_500,
  }), /대상/)
  assert.throws(() => verifyIdToken(jwt(claims), {
    publicKey, clientId: "quality-hub-client", issuer: claims.iss, nonce: "other", code: "authorization-code", nowSeconds: 1_999_999_500,
  }), /nonce/)
  assert.throws(() => verifyIdToken(jwt(claims), {
    publicKey, clientId: "quality-hub-client", issuer: claims.iss, nonce: claims.nonce, code: "changed", nowSeconds: 1_999_999_500,
  }), /c_hash/)
  assert.throws(() => verifyIdToken(jwt({ ...claims, exp: 100 }), {
    publicKey, clientId: "quality-hub-client", issuer: claims.iss, nonce: claims.nonce, code: "authorization-code", nowSeconds: 1_999_999_500,
  }), /만료/)
})

test("Claim 매핑은 설정된 키만 사용하고 외부 returnTo를 차단한다", () => {
  const identity = mapIdentityClaims({ ...baseClaims(), employeeId: "Employee.Example" }, {
    userIdClaim: "employeeId",
    displayNameClaim: "name",
    departmentClaim: "department",
  })
  assert.equal(identity.userId, "employee.example")
  assert.equal(identity.displayName, "품질 사용자")
  assert.equal(normalizeReturnTo("/rules?major=A#detail"), "/rules?major=A#detail")
  assert.equal(normalizeReturnTo("//evil.example/path"), "/")
  assert.equal(normalizeReturnTo("https://evil.example/path"), "/")
})
