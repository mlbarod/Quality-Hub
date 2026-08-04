import assert from "node:assert/strict"
import { once } from "node:events"
import test from "node:test"

import {
  createQualityHubServer,
  parsePort,
  resolveStaticPath,
} from "../server.mjs"

async function startTestServer() {
  const server = createQualityHubServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")

  const address = server.address()
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
}

test("PORT는 유효한 포트 번호만 허용한다", () => {
  assert.equal(parsePort("4173"), 4173)
  assert.throws(() => parsePort("0"), /between 1 and 65535/)
  assert.throws(() => parsePort("65536"), /between 1 and 65535/)
  assert.throws(() => parsePort("abc"), /between 1 and 65535/)
})

test("정적 경로가 prototype 밖으로 벗어나지 못한다", () => {
  assert.equal(resolveStaticPath("/%2e%2e/README.md").forbidden, true)
  assert.equal(resolveStaticPath("/%E0%A4%A").badRequest, true)
})

test("메인 화면과 정적 자산을 제공한다", async (t) => {
  const { server, baseUrl } = await startTestServer()
  t.after(() => server.close())

  const indexResponse = await fetch(`${baseUrl}/`)
  assert.equal(indexResponse.status, 200)
  assert.match(indexResponse.headers.get("content-type"), /^text\/html/)
  assert.equal(indexResponse.headers.get("x-content-type-options"), "nosniff")
  assert.match(await indexResponse.text(), /<title>Quality Hub<\/title>/)

  const cssResponse = await fetch(`${baseUrl}/styles.css`)
  assert.equal(cssResponse.status, 200)
  assert.match(cssResponse.headers.get("content-type"), /^text\/css/)
})

test("HEAD, 미존재 경로와 허용하지 않는 메서드를 처리한다", async (t) => {
  const { server, baseUrl } = await startTestServer()
  t.after(() => server.close())

  const headResponse = await fetch(`${baseUrl}/app.js`, { method: "HEAD" })
  assert.equal(headResponse.status, 200)
  assert.equal(await headResponse.text(), "")

  assert.equal((await fetch(`${baseUrl}/missing`)).status, 404)

  const postResponse = await fetch(`${baseUrl}/`, { method: "POST" })
  assert.equal(postResponse.status, 405)
  assert.equal(postResponse.headers.get("allow"), "GET, HEAD")
})
