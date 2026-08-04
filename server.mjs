import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, isAbsolute, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath, URL } from "node:url"

const rootDir = fileURLToPath(new URL(".", import.meta.url))
const prototypeDir = join(rootDir, "prototype")
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

export function resolveStaticPath(pathname, staticDir = prototypeDir) {
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

export function createQualityHubServer({ staticDir = prototypeDir } = {}) {
  return createServer((req, res) => serveStatic(req, res, staticDir))
}

function startServer() {
  let port
  try {
    port = parsePort(process.env.PORT ?? String(defaultPort))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }

  const host = process.env.HOST?.trim() || defaultHost
  const server = createQualityHubServer()

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Use a different port, for example PORT=${port + 1} node server.mjs.`)
    } else if (error.code === "EACCES") {
      console.error(`Permission denied while opening ${host}:${port}. Choose a port above 1024.`)
    } else {
      console.error(error)
    }

    process.exitCode = 1
  })

  server.listen(port, host, () => {
    console.log(`Quality Hub server listening on http://${host}:${port}`)
  })
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (entryPath === fileURLToPath(import.meta.url)) {
  startServer()
}
