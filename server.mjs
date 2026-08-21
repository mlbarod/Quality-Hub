import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { createServer as createHttpServer } from "node:http"
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path"
import { parseEnv } from "node:util"
import { fileURLToPath, URL } from "node:url"

import { createAgentChatApi } from "./server/agentChatApi.mjs"
import { authorizePrincipal, createAuthApi, sendAuthorizationFailure } from "./server/authApi.mjs"
import { createChangeCategoryApi } from "./server/changeCategoryApi.mjs"
import { createDashboardApi } from "./server/dashboardApi.mjs"
import { loadOidcConfig } from "./server/oidcService.mjs"
import { createQnaApi } from "./server/qnaApi.mjs"
import { createReportApi } from "./server/reportApi.mjs"
import { createRuleSopApi } from "./server/ruleSopApi.mjs"

const rootDir = fileURLToPath(new URL(".", import.meta.url))
export const sourceStaticDir = join(rootDir, "prototype")
export const builtStaticDir = join(rootDir, "dist")
export const serverEnvironmentFiles = [".env.rag", ".env.gpt-oss", ".env.db", ".env.sso"]
const defaultPort = 4173
const defaultHost = "0.0.0.0"
const healthPath = "/healthz"
const readinessPath = "/readyz"
const faviconPath = "/favicon.ico"
const shutdownTimeoutMs = 10_000
const readinessRequirements = {
  database: ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"],
  rag: ["RAG_API_URL", "PASS_KEY", "RAG_KEY", "INDEX_NAME"],
  gptOss: ["GPT_OSS_API_URL", "GPT_OSS_CREDENTIAL_KEY", "GPT_OSS_SYSTEM_NAME", "GPT_OSS_USER_ID"],
}

const productionSecurityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "frame-src 'self' https:",
    "img-src 'self' data: blob: https:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  ].join("; "),
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

export function loadServerEnvironment({
  environmentFiles = serverEnvironmentFiles,
  loadFile = (filePath) => Object.assign(process.env, parseEnv(readFileSync(filePath, "utf8"))),
} = {}) {
  const loadedFiles = []
  for (const fileName of environmentFiles) {
    const filePath = join(rootDir, fileName)
    if (!existsSync(filePath)) continue
    loadFile(filePath)
    loadedFiles.push(filePath)
  }
  return loadedFiles
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

function applyProductionSecurityHeaders(res) {
  for (const [name, value] of Object.entries(productionSecurityHeaders)) {
    res.setHeader(name, value)
  }
}

function serveHealth(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" })
    return
  }

  const body = JSON.stringify({ status: "ok" })
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  })
  res.end(req.method === "HEAD" ? undefined : body)
}

function serveFaviconFallback(res) {
  res.writeHead(204, {
    "Cache-Control": "public, max-age=86400",
  })
  res.end()
}

export function getRuntimeReadiness(environment = process.env) {
  const components = Object.fromEntries(Object.entries(readinessRequirements).map(([component, names]) => [
    component,
    names.every((name) => typeof environment[name] === "string" && environment[name].trim().length > 0)
      ? "configured"
      : "not_configured",
  ]))
  try {
    const oidc = loadOidcConfig(environment)
    components.sso = oidc.enabled ? "configured" : "disabled"
  } catch {
    components.sso = "not_configured"
  }
  const ready = Object.values(components).every((status) => status === "configured" || status === "disabled")
  return { ready, components }
}

function serveReadiness(req, res, environment) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" })
    return
  }

  const readiness = getRuntimeReadiness(environment)
  const body = JSON.stringify({
    status: readiness.ready ? "ready" : "degraded",
    components: readiness.components,
  })
  res.writeHead(readiness.ready ? 200 : 503, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  })
  res.end(req.method === "HEAD" ? undefined : body)
}

export function parsePort(value = String(defaultPort)) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`PORT must be an integer between 1 and 65535. Received: ${value}`)
  }

  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535. Received: ${value}`)
  }

  return port
}

export function resolvePort(args = [], environmentPort = process.env.PORT) {
  const inlinePortArg = args.find((arg) => arg.startsWith("--port="))
  const portArgIndex = args.indexOf("--port")

  if (inlinePortArg) {
    return parsePort(inlinePortArg.slice("--port=".length))
  }

  if (portArgIndex !== -1) {
    return parsePort(args[portArgIndex + 1] ?? "")
  }

  return parsePort(environmentPort ?? String(defaultPort))
}

export function resolveStaticPath(pathname, staticDir = builtStaticDir) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return { badRequest: true }
  }

  if (decodedPath.includes("\0")) {
    return { badRequest: true }
  }

  if (decodedPath.split(/[/\\]+/).includes("..")) {
    return { forbidden: true }
  }

  const requestedPath = decodedPath === "/" ? "index.html" : decodedPath
  const normalizedPath = normalize(requestedPath).replace(/^[/\\]+/, "")
  const staticRoot = resolve(staticDir)
  const filePath = resolve(staticRoot, normalizedPath)
  const isInsideStaticRoot = filePath === staticRoot || filePath.startsWith(`${staticRoot}${sep}`)

  if (!isInsideStaticRoot || isAbsolute(normalizedPath) || normalizedPath.startsWith("..")) {
    return { forbidden: true }
  }

  return { filePath }
}

function getStaticCacheControl(filePath, staticDir) {
  const relativePath = relative(staticDir, filePath)
  if (relativePath === "index.html") return "no-cache"
  if (relativePath.startsWith(`assets${sep}`)) return "public, max-age=31536000, immutable"
  return "no-cache"
}

function isPublicStaticAsset(pathname, staticDir) {
  const { filePath, badRequest, forbidden } = resolveStaticPath(pathname, staticDir)
  if (badRequest || forbidden || !filePath || relative(staticDir, filePath) === "index.html") return false
  return existsSync(filePath) && statSync(filePath).isFile()
}

function escapeHtmlAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function personalizeIndex(source, principal, authEnabled) {
  if (!authEnabled || !principal) return source
  return source
    .replace('data-auth-mode="legacy"', 'data-auth-mode="sso"')
    .replace(/data-current-role="(?:master|admin|general|blocked)"/, `data-current-role="${escapeHtmlAttribute(principal.role)}"`)
}

function serveStatic(req, res, staticDir, { principal = null, authEnabled = false } = {}) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" })
    return
  }

  let url
  try {
    url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
  } catch {
    sendText(res, 400, "Bad Request")
    return
  }

  const { badRequest, forbidden, filePath } = resolveStaticPath(url.pathname, staticDir)

  if (badRequest) {
    sendText(res, 400, "Bad Request")
    return
  }

  if (forbidden) {
    sendText(res, 403, "Forbidden")
    return
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendText(res, 404, "Not Found")
    return
  }

  const isIndex = relative(staticDir, filePath) === "index.html"
  const personalizedBody = isIndex ? personalizeIndex(readFileSync(filePath, "utf8"), principal, authEnabled) : null
  const fileSize = personalizedBody === null ? statSync(filePath).size : Buffer.byteLength(personalizedBody)
  const contentType = mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream"

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": fileSize,
    "Cache-Control": getStaticCacheControl(filePath, staticDir),
  })

  if (req.method === "HEAD") {
    res.end()
    return
  }

  if (personalizedBody !== null) {
    res.end(personalizedBody)
    return
  }

  const stream = createReadStream(filePath)
  stream.on("error", (error) => {
    console.error("Failed to read static file:", error)
    if (!res.headersSent) sendText(res, 500, "Internal Server Error")
    else res.destroy(error)
  })
  stream.pipe(res)
}

export function createQualityHubServer({
  staticDir = builtStaticDir,
  agentApi = createAgentChatApi(),
  changeCategoryApi = createChangeCategoryApi(),
  dashboardApi = createDashboardApi(),
  qnaApi = createQnaApi(),
  reportApi = createReportApi(),
  ruleSopApi = createRuleSopApi(),
  environment = process.env,
  authApi = createAuthApi({ environment }),
} = {}) {
  const server = createHttpServer(async (req, res) => {
    try {
      applyProductionSecurityHeaders(res)
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      if (url.pathname === healthPath) {
        serveHealth(req, res)
        return
      }
      if (url.pathname === readinessPath) {
        serveReadiness(req, res, environment)
        return
      }
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname === faviconPath) {
        serveFaviconFallback(res)
        return
      }
      if (authApi.enabled && (req.method === "GET" || req.method === "HEAD") && isPublicStaticAsset(url.pathname, staticDir)) {
        serveStatic(req, res, staticDir)
        return
      }
      if (authApi.enabled && url.pathname.startsWith("/auth/") && await authApi.handle(req, res)) return
      let principal = null
      if (authApi.enabled) {
        principal = await authApi.authenticate(req)
        req.auth = principal
        const authorization = authorizePrincipal(principal, req)
        if (!authorization.allowed) {
          if (url.pathname.startsWith("/api/")) {
            sendAuthorizationFailure(res, authorization.status)
          } else if ((req.method === "GET" || req.method === "HEAD") && authorization.status === 401) {
            const returnTo = `${url.pathname}${url.search}`
            res.writeHead(302, { Location: `/auth/login?returnTo=${encodeURIComponent(returnTo)}`, "Cache-Control": "no-store" })
            res.end()
          } else {
            sendText(res, authorization.status, authorization.status === 401 ? "Authentication Required" : "Forbidden")
          }
          return
        }
        if (principal) {
          req.headers["x-quality-hub-user-id"] = principal.userId
          req.headers["x-quality-hub-user-name"] = encodeURIComponent(principal.displayName)
          req.headers["x-quality-hub-role"] = principal.role
        }
        if (url.pathname.startsWith("/api/auth/") && await authApi.handle(req, res)) return
      }
      if (await agentApi.handle(req, res)) return
      if (await changeCategoryApi.handle(req, res)) return
      if (await dashboardApi.handle(req, res)) return
      if (await qnaApi.handle(req, res)) return
      if (await reportApi.handle(req, res)) return
      if (await ruleSopApi.handle(req, res)) return
      serveStatic(req, res, staticDir, { principal, authEnabled: authApi.enabled })
    } catch (error) {
      console.error("Quality Hub request failed:", error)
      if (!res.headersSent) sendText(res, 500, "Internal Server Error")
      else res.destroy(error)
    }
  })
  server.headersTimeout = 15_000
  server.requestTimeout = 30_000
  server.keepAliveTimeout = 5_000
  server.maxHeadersCount = 100
  server.once("close", () => {
    void agentApi.close()
    void changeCategoryApi.close()
    void dashboardApi.close()
    void qnaApi.close()
    void reportApi.close()
    void ruleSopApi.close()
    void authApi.close()
  })
  return server
}

export function resolveServeMode(args = []) {
  const sourceRequested = args.includes("--source")
  const builtRequested = args.includes("--built")
  if (sourceRequested && builtRequested) {
    throw new Error("--source and --built cannot be used together.")
  }
  return sourceRequested ? "source" : "built"
}

function reportServerError(error, host, port) {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Use a different port, for example PORT=${port + 1} node server.mjs.`)
  } else if (error.code === "EACCES") {
    console.error(`Permission denied while opening ${host}:${port}. Choose a port above 1024.`)
  } else {
    console.error(error)
  }

  process.exitCode = 1
}

async function startSourceServer({ host, port }) {
  const { createServer: createViteServer } = await import("vite")
  const agentApi = createAgentChatApi()
  const changeCategoryApi = createChangeCategoryApi()
  const dashboardApi = createDashboardApi()
  const qnaApi = createQnaApi()
  const reportApi = createReportApi()
  const ruleSopApi = createRuleSopApi()
  const authApi = createAuthApi()
  let viteServer
  const httpServer = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      if (url.pathname === healthPath) {
        serveHealth(req, res)
        return
      }
      if (url.pathname === readinessPath) {
        serveReadiness(req, res, process.env)
        return
      }
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname === faviconPath) {
        serveFaviconFallback(res)
        return
      }
      if (authApi.enabled && url.pathname.startsWith("/auth/") && await authApi.handle(req, res)) return
      let principal = null
      if (authApi.enabled) {
        principal = await authApi.authenticate(req)
        req.auth = principal
        const authorization = authorizePrincipal(principal, req)
        if (!authorization.allowed) {
          if (url.pathname.startsWith("/api/")) sendAuthorizationFailure(res, authorization.status)
          else if ((req.method === "GET" || req.method === "HEAD") && authorization.status === 401) {
            res.writeHead(302, { Location: `/auth/login?returnTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`, "Cache-Control": "no-store" })
            res.end()
          } else sendText(res, authorization.status, "Forbidden")
          return
        }
        if (principal) {
          req.headers["x-quality-hub-user-id"] = principal.userId
          req.headers["x-quality-hub-user-name"] = encodeURIComponent(principal.displayName)
          req.headers["x-quality-hub-role"] = principal.role
        }
        if (url.pathname.startsWith("/api/auth/") && await authApi.handle(req, res)) return
      }
      if (await agentApi.handle(req, res)) return
      if (await changeCategoryApi.handle(req, res)) return
      if (await dashboardApi.handle(req, res)) return
      if (await qnaApi.handle(req, res)) return
      if (await reportApi.handle(req, res)) return
      if (await ruleSopApi.handle(req, res)) return
      if (authApi.enabled && principal && (url.pathname === "/" || url.pathname === "/index.html") && (req.method === "GET" || req.method === "HEAD")) {
        const transformed = await viteServer.transformIndexHtml(url.pathname, readFileSync(join(sourceStaticDir, "index.html"), "utf8"))
        const body = personalizeIndex(transformed, principal, true)
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
          "Cache-Control": "no-store",
        })
        res.end(req.method === "HEAD" ? undefined : body)
        return
      }
      viteServer.middlewares(req, res)
    } catch (error) {
      console.error("Quality Hub source request failed:", error)
      if (!res.headersSent) sendText(res, 500, "Internal Server Error")
      else res.destroy(error)
    }
  })
  httpServer.once("close", () => {
    void agentApi.close()
    void changeCategoryApi.close()
    void dashboardApi.close()
    void qnaApi.close()
    void reportApi.close()
    void ruleSopApi.close()
    void authApi.close()
    void viteServer?.close()
  })

  viteServer = await createViteServer({
    configFile: join(rootDir, "vite.config.mjs"),
    appType: "spa",
    server: {
      middlewareMode: true,
      ws: { server: httpServer },
    },
  })

  httpServer.on("error", (error) => reportServerError(error, host, port))
  httpServer.listen(port, host, () => {
    console.log(`Quality Hub source server listening on http://${host}:${port}`)
  })
  console.log("Quality Hub source server: changes are reflected without rebuilding.")
  return httpServer
}

function startBuiltServer({ host, port }) {
  if (!existsSync(join(builtStaticDir, "index.html"))) {
    console.error("Vite build output was not found. Run `npm run build` before `npm start`.")
    process.exitCode = 1
    return null
  }

  const server = createQualityHubServer()
  server.on("error", (error) => reportServerError(error, host, port))
  server.listen(port, host, () => {
    console.log(`Quality Hub built server listening on http://${host}:${port}`)
  })
  return server
}

export function installGracefulShutdown(server, {
  logger = console,
  timeoutMs = shutdownTimeoutMs,
  processRef = process,
} = {}) {
  let shuttingDown = false

  const shutdown = (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.log(`Quality Hub received ${signal}; stopping gracefully.`)

    const forceTimer = setTimeout(() => {
      logger.error("Quality Hub graceful shutdown timed out; closing active connections.")
      server.closeAllConnections?.()
      processRef.exitCode = 1
    }, timeoutMs)
    forceTimer.unref?.()

    server.close((error) => {
      clearTimeout(forceTimer)
      if (error) {
        logger.error("Quality Hub server shutdown failed:", error)
        processRef.exitCode = 1
      }
    })
  }

  const onSigterm = () => shutdown("SIGTERM")
  const onSigint = () => shutdown("SIGINT")
  processRef.once("SIGTERM", onSigterm)
  processRef.once("SIGINT", onSigint)

  return () => {
    processRef.off("SIGTERM", onSigterm)
    processRef.off("SIGINT", onSigint)
  }
}

async function startServer() {
  const args = process.argv.slice(2)
  let port
  let mode
  try {
    port = resolvePort(args)
    mode = resolveServeMode(args)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return null
  }

  const host = process.env.HOST?.trim() || defaultHost

  if (mode === "built") {
    return startBuiltServer({ host, port })
  }

  try {
    return await startSourceServer({ host, port })
  } catch (error) {
    reportServerError(error, host, port)
    return null
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (entryPath === fileURLToPath(import.meta.url)) {
  try {
    const loadedFiles = loadServerEnvironment()
    console.log(`Quality Hub environment files loaded: ${loadedFiles.map((filePath) => filePath.slice(rootDir.length)).join(", ") || "none"}`)
    void startServer().then((server) => {
      if (server) installGracefulShutdown(server)
    })
  } catch (error) {
    console.error(`Quality Hub 환경파일을 읽지 못했습니다: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  }
}
