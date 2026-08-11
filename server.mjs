import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer as createHttpServer } from "node:http"
import { extname, isAbsolute, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath, URL } from "node:url"

import { createAgentChatApi } from "./server/agentChatApi.mjs"

const rootDir = fileURLToPath(new URL(".", import.meta.url))
export const sourceStaticDir = join(rootDir, "prototype")
export const builtStaticDir = join(rootDir, "dist")
const defaultPort = 4173
const defaultHost = "0.0.0.0"

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

function serveStatic(req, res, staticDir) {
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

  const fileSize = statSync(filePath).size
  const contentType = mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream"

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": fileSize,
    "Cache-Control": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  })

  if (req.method === "HEAD") {
    res.end()
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
} = {}) {
  const server = createHttpServer(async (req, res) => {
    try {
      if (await agentApi.handle(req, res)) return
      serveStatic(req, res, staticDir)
    } catch (error) {
      console.error("Quality Hub request failed:", error)
      if (!res.headersSent) sendText(res, 500, "Internal Server Error")
      else res.destroy(error)
    }
  })
  server.once("close", () => { void agentApi.close() })
  return server
}

export function resolveServeMode(args = []) {
  return args.includes("--built") ? "built" : "source"
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
  let viteServer
  const httpServer = createHttpServer(async (req, res) => {
    try {
      if (await agentApi.handle(req, res)) return
      viteServer.middlewares(req, res)
    } catch (error) {
      console.error("Quality Hub source request failed:", error)
      if (!res.headersSent) sendText(res, 500, "Internal Server Error")
      else res.destroy(error)
    }
  })
  httpServer.once("close", () => { void agentApi.close() })

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
}

function startBuiltServer({ host, port }) {
  if (!existsSync(join(builtStaticDir, "index.html"))) {
    console.error("Vite build output was not found. Run `npm run build` before `node server.mjs --built`.")
    process.exitCode = 1
    return
  }

  const server = createQualityHubServer()
  server.on("error", (error) => reportServerError(error, host, port))
  server.listen(port, host, () => {
    console.log(`Quality Hub built server listening on http://${host}:${port}`)
  })
}

async function startServer() {
  const args = process.argv.slice(2)
  let port
  try {
    port = resolvePort(args)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }

  const host = process.env.HOST?.trim() || defaultHost
  const mode = resolveServeMode(args)

  if (mode === "built") {
    startBuiltServer({ host, port })
    return
  }

  try {
    await startSourceServer({ host, port })
  } catch (error) {
    reportServerError(error, host, port)
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (entryPath === fileURLToPath(import.meta.url)) {
  void startServer()
}
