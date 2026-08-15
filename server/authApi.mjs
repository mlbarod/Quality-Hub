import {
  createOidcLoginRequest,
  describeClaimsSafely,
  hashOpaqueToken,
  loadCertificatePublicKey,
  loadOidcConfig,
  mapIdentityClaims,
  normalizeReturnTo,
  randomOpaqueToken,
  verifyIdToken,
} from "./oidcService.mjs"
import { createAuthRepository } from "./authRepository.mjs"

const MAX_FORM_BYTES = 24 * 1024
const MAX_JSON_BYTES = 16 * 1024

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders,
  })
  res.end(body)
}

function sendText(res, statusCode, message, extraHeaders = {}) {
  const body = `${message}\n`
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders,
  })
  res.end(body)
}

function redirect(res, location, cookies = []) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...(cookies.length > 0 ? { "Set-Cookie": cookies } : {}),
  })
  res.end()
}

function parseCookies(req) {
  const cookieHeader = Array.isArray(req.headers.cookie) ? req.headers.cookie[0] : req.headers.cookie
  const cookies = new Map()
  for (const segment of (cookieHeader ?? "").split(";")) {
    const separator = segment.indexOf("=")
    if (separator <= 0) continue
    const name = segment.slice(0, separator).trim()
    const value = segment.slice(separator + 1).trim()
    if (name && !cookies.has(name)) cookies.set(name, value)
  }
  return cookies
}

async function readBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw new AuthRequestError("요청 내용이 너무 큽니다.", 413, "BODY_TOO_LARGE")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function readForm(req) {
  const contentType = String(req.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase()
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new AuthRequestError("SSO 응답 형식이 올바르지 않습니다.", 415, "INVALID_CONTENT_TYPE")
  }
  return new URLSearchParams(await readBody(req, MAX_FORM_BYTES))
}

async function readJson(req) {
  const source = await readBody(req, MAX_JSON_BYTES)
  if (!source) return {}
  try {
    const value = JSON.parse(source)
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error()
    return value
  } catch {
    throw new AuthRequestError("JSON 요청 형식이 올바르지 않습니다.", 400, "INVALID_JSON")
  }
}

class AuthRequestError extends Error {
  constructor(message, status = 400, code = "AUTH_REQUEST_FAILED") {
    super(message)
    this.name = "AuthRequestError"
    this.status = status
    this.code = code
  }
}

function isDatabaseError(error) {
  return error && typeof error === "object" && ("sqlState" in error || "errno" in error || "fatal" in error)
}

function rolePolicy(role) {
  return {
    canAccess: role !== "blocked",
    canManageContent: role === "master" || role === "admin",
    canManagePermissions: role === "master",
    canManageMasters: role === "master",
  }
}

function publicPrincipal(principal) {
  return {
    user: {
      userId: principal.userId,
      displayName: principal.displayName,
      department: principal.department,
    },
    role: principal.role,
    policy: rolePolicy(principal.role),
    expiresAt: principal.expiresAt.toISOString(),
  }
}

function routeOf(req) {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    return { pathname: url.pathname, url }
  } catch {
    return null
  }
}

function requireTrustedOrigin(req, expectedOrigin) {
  const source = req.headers.origin ?? req.headers.referer
  const value = Array.isArray(source) ? source[0] : source
  let origin
  try {
    origin = new URL(value).origin
  } catch {
    throw new AuthRequestError("요청 출처를 확인할 수 없습니다.", 403, "ORIGIN_REQUIRED")
  }
  if (origin !== expectedOrigin) throw new AuthRequestError("허용되지 않은 요청 출처입니다.", 403, "ORIGIN_DENIED")
}

function pathPart(pathname, prefix) {
  if (!pathname.startsWith(`${prefix}/`)) return null
  const encoded = pathname.slice(prefix.length + 1)
  if (!encoded || encoded.includes("/")) return null
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

function cookieNames(config) {
  return config.secureCookies
    ? { correlation: "__Secure-qh_oidc", session: "__Host-qh_session" }
    : { correlation: "qh_oidc", session: "qh_session" }
}

function cookie(name, value, { maxAge, sameSite, secure, path = "/" }) {
  return [
    `${name}=${value}`,
    `Path=${path}`,
    "HttpOnly",
    secure ? "Secure" : "",
    `SameSite=${sameSite}`,
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ].filter(Boolean).join("; ")
}

export function createAuthApi({
  environment = process.env,
  config = loadOidcConfig(environment),
  repository,
  repositoryFactory = createAuthRepository,
  publicKey,
  certificateLoader = loadCertificatePublicKey,
  logger = console,
  now = () => new Date(),
} = {}) {
  if (!config.enabled) {
    return {
      enabled: false,
      async handle() { return false },
      async authenticate() { return null },
      async close() {},
    }
  }

  let activeRepository = repository
  let ownsRepository = false
  let activePublicKey = publicKey
  let bootstrapPromise
  const names = cookieNames(config)
  const serviceOrigin = new URL(config.redirectUri).origin

  const getRepository = () => {
    if (!activeRepository) {
      activeRepository = repositoryFactory()
      ownsRepository = true
    }
    if (!bootstrapPromise) {
      bootstrapPromise = activeRepository.bootstrapMasters(config.bootstrapMasterUserIds).catch((error) => {
        bootstrapPromise = undefined
        throw error
      })
    }
    return activeRepository
  }

  const readyRepository = async () => {
    const value = getRepository()
    await bootstrapPromise
    return value
  }

  const getPublicKey = () => {
    if (!activePublicKey) activePublicKey = certificateLoader(config.certificatePath)
    return activePublicKey
  }

  const clearCorrelationCookie = () => cookie(names.correlation, "", {
    maxAge: 0,
    sameSite: "None",
    secure: config.secureCookies,
    path: "/auth/callback",
  })
  const clearSessionCookie = () => cookie(names.session, "", {
    maxAge: 0,
    sameSite: "Lax",
    secure: config.secureCookies,
  })

  const requireMaster = (req) => {
    if (req.auth?.role !== "master") throw new AuthRequestError("마스터 권한이 필요합니다.", 403, "MASTER_REQUIRED")
    return req.auth
  }

  const handlePermissions = async (req, res, route) => {
    if (!route.pathname.startsWith("/api/auth/permissions")) return false
    const principal = requireMaster(req)
    const repositoryValue = await readyRepository()
    const ruleId = pathPart(route.pathname, "/api/auth/permissions")
    if (req.method === "GET" && route.pathname === "/api/auth/permissions") {
      sendJson(res, 200, { rules: await repositoryValue.listRules(), masters: await repositoryValue.listMasters() })
      return true
    }
    if (req.method === "GET" && route.pathname === "/api/auth/permissions/history") {
      sendJson(res, 200, { history: await repositoryValue.listPermissionHistory() })
      return true
    }
    if (req.method === "POST" && route.pathname === "/api/auth/permissions") {
      requireTrustedOrigin(req, serviceOrigin)
      const rule = await repositoryValue.createRule({ ...(await readJson(req)), actorUserId: principal.userId })
      sendJson(res, 201, { rule })
      return true
    }
    if (req.method === "PATCH" && ruleId) {
      requireTrustedOrigin(req, serviceOrigin)
      const rule = await repositoryValue.updateRule(ruleId, { ...(await readJson(req)), actorUserId: principal.userId })
      sendJson(res, 200, { rule })
      return true
    }
    if (req.method === "DELETE" && ruleId) {
      requireTrustedOrigin(req, serviceOrigin)
      await repositoryValue.deleteRule(ruleId, principal.userId)
      sendJson(res, 200, { deleted: true })
      return true
    }
    throw new AuthRequestError("지원하지 않는 권한 API 요청입니다.", 405, "METHOD_NOT_ALLOWED")
  }

  const handleMasters = async (req, res, route) => {
    if (!route.pathname.startsWith("/api/auth/masters")) return false
    const principal = requireMaster(req)
    const repositoryValue = await readyRepository()
    const userId = pathPart(route.pathname, "/api/auth/masters")
    if (req.method === "POST" && route.pathname === "/api/auth/masters") {
      requireTrustedOrigin(req, serviceOrigin)
      const master = await repositoryValue.addMaster({ ...(await readJson(req)), actorUserId: principal.userId })
      sendJson(res, 201, { master })
      return true
    }
    if (req.method === "DELETE" && userId) {
      requireTrustedOrigin(req, serviceOrigin)
      await repositoryValue.removeMaster({ userId, actorUserId: principal.userId })
      sendJson(res, 200, { deleted: true })
      return true
    }
    throw new AuthRequestError("지원하지 않는 마스터 API 요청입니다.", 405, "METHOD_NOT_ALLOWED")
  }

  return {
    enabled: true,

    async authenticate(req) {
      const rawSession = parseCookies(req).get(names.session)
      if (!rawSession || rawSession.length > 256) return null
      const repositoryValue = await readyRepository()
      const identity = await repositoryValue.findSession(hashOpaqueToken(rawSession, config.sessionSecret), {
        now: now(),
        idleSeconds: config.idleSeconds,
      })
      if (!identity) return null
      return { ...identity, role: await repositoryValue.resolveRole(identity) }
    },

    async handle(req, res) {
      const route = routeOf(req)
      if (!route) return false
      try {
        if (route.pathname === "/auth/login") {
          if (req.method !== "GET") throw new AuthRequestError("GET 요청만 허용됩니다.", 405, "METHOD_NOT_ALLOWED")
          const login = createOidcLoginRequest(config, { returnTo: normalizeReturnTo(route.url.searchParams.get("returnTo") ?? "/") })
          const timestamp = now().getTime()
          await (await readyRepository()).createLoginTransaction({
            stateHash: hashOpaqueToken(login.state, config.sessionSecret),
            correlationHash: hashOpaqueToken(login.correlation, config.sessionSecret),
            nonce: login.nonce,
            returnTo: login.returnTo,
            expiresAt: new Date(timestamp + config.loginTransactionSeconds * 1000),
          })
          redirect(res, login.url, [cookie(names.correlation, login.correlation, {
            maxAge: config.loginTransactionSeconds,
            sameSite: "None",
            secure: config.secureCookies,
            path: "/auth/callback",
          })])
          return true
        }

        if (route.pathname === "/auth/callback") {
          if (req.method !== "POST") throw new AuthRequestError("POST 요청만 허용됩니다.", 405, "METHOD_NOT_ALLOWED")
          const form = await readForm(req)
          const state = form.get("state") ?? ""
          const correlation = parseCookies(req).get(names.correlation) ?? ""
          if (!state || !correlation) throw new AuthRequestError("SSO 요청 상태를 확인할 수 없습니다.", 400, "OIDC_STATE_INVALID")
          const transaction = await (await readyRepository()).consumeLoginTransaction({
            stateHash: hashOpaqueToken(state, config.sessionSecret),
            correlationHash: hashOpaqueToken(correlation, config.sessionSecret),
            now: now(),
          })
          if (!transaction) throw new AuthRequestError("SSO 요청이 만료되었거나 이미 사용되었습니다.", 400, "OIDC_STATE_INVALID")
          if (form.has("error")) throw new AuthRequestError("통합인증 로그인이 완료되지 않았습니다.", 401, "OIDC_PROVIDER_ERROR")
          const code = form.get("code") ?? ""
          const signingKey = getPublicKey()
          let claims
          try {
            claims = verifyIdToken(form.get("id_token") ?? "", {
              publicKey: signingKey,
              clientId: config.clientId,
              issuer: config.expectedIssuer,
              nonce: transaction.nonce,
              code,
              clockToleranceSeconds: config.clockToleranceSeconds,
              nowSeconds: Math.floor(now().getTime() / 1000),
              allowIssuerDiscovery: config.safeClaimTrace,
            })
          } catch {
            throw new AuthRequestError("통합인증 토큰 검증에 실패했습니다.", 401, "OIDC_TOKEN_INVALID")
          }

          if (config.safeClaimTrace) {
            logger.info("SSO safe claim trace", { issuer: claims.iss, claimTypes: describeClaimsSafely(claims) })
            sendText(res, 503, "Claim 확인 모드입니다. 서버 로그의 Claim 키/자료형과 issuer를 확인한 뒤 매핑 환경변수를 설정하세요.", {
              "Set-Cookie": clearCorrelationCookie(),
            })
            return true
          }

          let identity
          try {
            identity = mapIdentityClaims(claims, config)
          } catch {
            throw new AuthRequestError("통합인증 사용자 Claim 매핑에 실패했습니다.", 401, "OIDC_CLAIM_MAPPING_FAILED")
          }
          const current = now()
          const absoluteExpiresAt = new Date(Math.min(
            identity.tokenExpiresAt.getTime(),
            current.getTime() + config.absoluteSeconds * 1000,
          ))
          const idleExpiresAt = new Date(Math.min(
            absoluteExpiresAt.getTime(),
            current.getTime() + config.idleSeconds * 1000,
          ))
          const sessionToken = randomOpaqueToken()
          await (await readyRepository()).createSession({
            sessionHash: hashOpaqueToken(sessionToken, config.sessionSecret),
            identity,
            expiresAt: identity.tokenExpiresAt,
            idleExpiresAt,
            absoluteExpiresAt,
          })
          redirect(res, transaction.returnTo, [
            clearCorrelationCookie(),
            cookie(names.session, sessionToken, {
              maxAge: Math.max(1, Math.floor((absoluteExpiresAt.getTime() - current.getTime()) / 1000)),
              sameSite: "Lax",
              secure: config.secureCookies,
            }),
          ])
          return true
        }

        if (route.pathname === "/auth/logout") {
          if (req.method !== "POST") throw new AuthRequestError("POST 요청만 허용됩니다.", 405, "METHOD_NOT_ALLOWED")
          requireTrustedOrigin(req, serviceOrigin)
          const rawSession = parseCookies(req).get(names.session)
          if (rawSession) await (await readyRepository()).revokeSession(hashOpaqueToken(rawSession, config.sessionSecret))
          redirect(res, config.signoutUrl, [clearSessionCookie()])
          return true
        }

        if (route.pathname === "/api/auth/session") {
          if (req.method !== "GET") throw new AuthRequestError("GET 요청만 허용됩니다.", 405, "METHOD_NOT_ALLOWED")
          if (!req.auth) throw new AuthRequestError("인증이 필요합니다.", 401, "AUTHENTICATION_REQUIRED")
          sendJson(res, 200, publicPrincipal(req.auth))
          return true
        }

        if (await handlePermissions(req, res, route)) return true
        if (await handleMasters(req, res, route)) return true
        return false
      } catch (error) {
        const apiPath = route.pathname.startsWith("/api/")
        const status = error instanceof AuthRequestError ? error.status : isDatabaseError(error) ? 503 : error instanceof TypeError ? 400 : 500
        const code = error instanceof AuthRequestError ? error.code : isDatabaseError(error) ? "AUTH_DB_FAILED" : "AUTH_FAILED"
        logger.error("SSO request failed", {
          method: req.method ?? "GET",
          path: route.pathname,
          status,
          code,
          errorName: error?.name,
          dbCode: error?.code,
        })
        if (apiPath) sendJson(res, status, { error: { code, message: status >= 500 ? "SSO 요청을 처리하지 못했습니다." : error.message } })
        else sendText(res, status, status >= 500 ? "SSO 요청을 처리하지 못했습니다." : error.message, route.pathname === "/auth/callback" ? { "Set-Cookie": clearCorrelationCookie() } : {})
        return true
      }
    },

    async close() {
      if (ownsRepository && activeRepository) await activeRepository.close()
    },
  }
}

export function authorizePrincipal(principal, req) {
  const route = routeOf(req)
  if (!route) return { allowed: false, status: 400 }
  if (!route.pathname.startsWith("/api/")) return principal ? { allowed: true } : { allowed: false, status: 401 }
  if (route.pathname === "/api/auth/session") return { allowed: Boolean(principal), status: 401 }
  if (!principal) return { allowed: false, status: 401 }
  if (principal.role === "blocked") return { allowed: false, status: 403 }
  const mutatesManagedContent = (route.pathname === "/api/reports" || route.pathname.startsWith("/api/reports/")
    || route.pathname === "/api/rules" || route.pathname.startsWith("/api/rules/"))
    && !["GET", "HEAD"].includes(req.method ?? "GET")
  if (mutatesManagedContent && principal.role === "general") return { allowed: false, status: 403 }
  return { allowed: true }
}

export function sendAuthorizationFailure(res, status) {
  sendJson(res, status, {
    error: {
      code: status === 401 ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
      message: status === 401 ? "인증이 필요합니다." : "이 요청을 수행할 권한이 없습니다.",
    },
  })
}
