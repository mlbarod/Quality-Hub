import { afterEach, beforeEach, expect, test, vi } from 'vitest'

let repository
const post = { id: 'Q-2026-001', questionId: 1, title: '질문', messages: [], detailLoaded: false, updatedAt: '2026-09-11T00:00:00', views: 0 }
const snapshot = { posts: [post], notifications: [], history: [] }
const response = (value) => new Response(JSON.stringify(value), { status: 200 })

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('MODE', 'production')
  document.body.innerHTML = '<div class="prototype" data-current-role="master"></div>'
  window.__qualityHubCurrentUser = { userId: 'user.one', name: '사용자' }
  repository = (await import('./repository.js')).qnaRepository
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); delete window.__qualityHubCurrentUser })

test('동시 진입 조회와 15초 내 재진입은 목록 요청 하나를 공유한다', async () => {
  let resolve
  const fetch = vi.fn(() => new Promise((done) => { resolve = done }))
  vi.stubGlobal('fetch', fetch)
  const first = repository.getSnapshot()
  const second = repository.getSnapshot()
  expect(fetch).toHaveBeenCalledTimes(1)
  resolve(response(snapshot))
  await Promise.all([first, second])
  await repository.getSnapshot()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toBe('/api/qna?summary=1')
})

test('질문과 답변 저장 성공 후 추가 GET 없이 서버 결과를 반영한다', async () => {
  const saved = { ...post, detailLoaded: true, content: '<p>저장된 본문</p>' }
  const message = { id: '5', messageId: 5, body: '새 답변', content: '<p>새 답변</p>', time: '2026-09-11T00:01:00' }
  const fetch = vi.fn().mockResolvedValueOnce(response({ post: saved, questionId: 1 })).mockResolvedValueOnce(response({ messageId: 5, message, questionStatus: 'active' }))
  vi.stubGlobal('fetch', fetch)
  const created = await repository.createQuestion({ title: '질문' })
  expect(created.posts[0].content).toBe(saved.content)
  const replied = await repository.createMessage(1, { bodyHtml: '<p>새 답변</p>' })
  expect(replied.posts[0].messages[0].messageId).toBe(5)
  expect(replied.posts[0].status).toBe('active')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls.every(([, init]) => init.method === 'POST')).toBe(true)
})

test('늦게 도착한 목록 응답은 방금 저장한 글을 덮어쓰지 않는다', async () => {
  let resolve
  const fetch = vi.fn().mockImplementationOnce(() => new Promise((done) => { resolve = done })).mockResolvedValueOnce(response({ post: { ...post, detailLoaded: true }, questionId: 1 }))
  vi.stubGlobal('fetch', fetch)
  const loading = repository.getSnapshot()
  await repository.createQuestion({ title: '질문' })
  resolve(response({ posts: [], notifications: [], history: [] }))
  await loading
  expect(repository.read().posts).toHaveLength(1)
})

test('사용자 변경 시 이전 사용자 캐시와 진행 중 응답을 버린다', async () => {
  let resolve
  vi.stubGlobal('fetch', vi.fn(() => new Promise((done) => { resolve = done })))
  const loading = repository.getSnapshot()
  window.__qualityHubCurrentUser = { userId: 'user.two', name: '다른 사용자' }
  expect(repository.read().posts).toHaveLength(0)
  resolve(response(snapshot))
  await loading
  expect(repository.read().posts).toHaveLength(0)
})

test('상세 요청은 한 글만 가져오고 저장 실패는 캐시를 변경하지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(snapshot)).mockResolvedValueOnce(response({ post: { ...post, content: '<p>상세</p>', detailLoaded: true } })).mockResolvedValueOnce(new Response('{"error":{"message":"저장 실패"}}', { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  await repository.getSnapshot()
  const detail = await repository.getQuestion(1)
  expect(detail.posts[0].detailLoaded).toBe(true)
  expect(fetch.mock.calls[1][0]).toBe('/api/qna/questions/1')
  await expect(repository.createQuestion({ title: '실패' })).rejects.toThrow('저장 실패')
  expect(repository.read().posts).toHaveLength(1)
})
