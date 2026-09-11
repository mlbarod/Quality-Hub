import assert from 'node:assert/strict'
import test from 'node:test'
import { buildQnaMail, createQnaMailNotifier, loadQnaMailConfig, richHtmlToMailText } from '../server/qnaMail.mjs'

const env = { KNOX_MAIL_ENABLED: 'true', KNOX_MAIL_USER_ID: 'developer', KNOX_MAIL_TOKEN: 'secret-token', KNOX_MAIL_SYSTEM_ID: 'system', KNOX_MAIL_PORTAL_URL: 'https://portal.example/hub/' }
const data = { question: { questionId: 7, title: '질문 제목', category: 'FDC', lineName: 'A', bodyHtml: '<p>첫째 &amp; 내용</p><p>둘째<br>셋째</p>' }, message: { bodyHtml: '<p>추가 내용</p>' }, recipientUserIds: ['author', 'master', 'MASTER'] }
const actor = { userId: 'author', displayName: '작성자' }
const event = { repository: { async getMailContext() { return data } }, eventType: 'question_created', questionId: 7, actor }

test('환경변수 비활성화와 누락·잘못된 설정을 구분한다', () => {
  assert.equal(loadQnaMailConfig({}), null)
  for (const key of ['KNOX_MAIL_USER_ID', 'KNOX_MAIL_TOKEN', 'KNOX_MAIL_SYSTEM_ID', 'KNOX_MAIL_PORTAL_URL']) assert.throws(() => loadQnaMailConfig({ ...env, [key]: '' }))
  assert.throws(() => loadQnaMailConfig({ ...env, KNOX_MAIL_PORTAL_URL: 'javascript:alert(1)' }))
  assert.throws(() => loadQnaMailConfig({ ...env, KNOX_MAIL_TIMEOUT_MS: '-1' }))
})

test('지정 제목, 본문 줄바꿈, 링크와 본인 포함 중복 없는 수신자를 만든다', () => {
  const payload = buildQnaMail(loadQnaMailConfig(env), { ...data, actor, eventType: 'question_created' })
  assert.equal(payload.subject, '[품질 Hub VOE] 게시글 등록:질문 제목')
  assert.equal(payload.sender.emailAddress, 'author@samsung.com')
  assert.deepEqual(payload.recipients, [{ emailAddress: 'author@samsung.com', recipientType: 'TO' }, { emailAddress: 'master@samsung.com', recipientType: 'TO' }])
  assert.match(payload.contents, /https:\/\/portal.example\/hub\/\?qna=open&questionId=7\n\n질문 본문:\n첫째 & 내용\n둘째\n셋째/)
  const reply = buildQnaMail(loadQnaMailConfig(env), { ...data, actor, eventType: 'message_created' })
  assert.equal(reply.subject, '[품질 Hub VOE] 추가 답변: 질문 제목')
  assert.match(reply.contents, /질문 본문:[\s\S]*추가 답변:\n추가 내용/)
  assert.equal(richHtmlToMailText('<script>secret</script><p>&#x1f600; &#99999999;</p><img src="data:secret">'), '😀 �\n[이미지: 게시글에서 확인]')
})

test('API 호출자는 개발자 ID, 발신자는 작성자이며 HTTP 접수는 검증 대기로 기록한다', async () => {
  const logs = []
  await createQnaMailNotifier({ env, logger: { info: (line) => logs.push(JSON.parse(line.slice('Q&A mail '.length))) }, fetchImpl: async (url, init) => {
    assert.equal(url.searchParams.get('userId'), 'developer')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers.Authorization, 'Bearer secret-token')
    assert.equal(init.headers['System-ID'], 'system')
    assert.equal(init.redirect, 'error')
    assert.equal(JSON.parse(init.body).sender.emailAddress, 'author@samsung.com')
    return new Response(null, { status: 202 })
  } }).notify(event)
  assert.equal(logs[0].state, 'http_accepted_response_unverified')
  assert.doesNotMatch(JSON.stringify(logs), /secret-token|작성자|samsung.com/)
})

test('HTTP 실패와 네트워크 실패는 추가 한 번만 재시도한다', async () => {
  for (const mode of ['http', 'network', 'recovery']) {
    let calls = 0
    const logs = []
    await createQnaMailNotifier({ env, logger: { info: (line) => logs.push(JSON.parse(line.slice('Q&A mail '.length))) }, fetchImpl: async () => {
      calls++
      if (mode === 'network') throw new Error('secret remote details')
      return new Response(null, { status: mode === 'recovery' && calls === 2 ? 200 : 500 })
    } }).notify(event)
    assert.equal(calls, 2)
    assert.equal(logs[0].state, 'retrying')
    assert.equal(logs[1].state, mode === 'recovery' ? 'http_accepted_response_unverified' : 'failed')
    assert.doesNotMatch(JSON.stringify(logs), /secret remote/)
  }
})

test('설정 없음, 조회 실패, 빈 수신자는 외부 발송하지 않는다', async () => {
  for (const options of [{ env: {} }, { repository: { async getMailContext() { throw new Error('DB secret') } } }, { repository: { async getMailContext() { return { ...data, recipientUserIds: [] } } } }]) {
    let calls = 0
    await createQnaMailNotifier({ env: options.env ?? env, logger: { info() {} }, fetchImpl: async () => { calls++; throw new Error() } }).notify({ ...event, repository: options.repository ?? event.repository })
    assert.equal(calls, 0)
  }
})

test('제한 시간이 지나면 중단 신호로 두 시도를 종료한다', async () => {
  let attempts = 0
  const keepAlive = setTimeout(() => {}, 2000)
  try {
    await createQnaMailNotifier({ env: { ...env, KNOX_MAIL_TIMEOUT_MS: '100' }, logger: { info() {} }, fetchImpl: async (_, { signal }) => {
      attempts++
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    } }).notify(event)
    assert.equal(attempts, 2)
  } finally {
    clearTimeout(keepAlive)
  }
})

function captureLogger() {
  const entries = []
  return { entries, logger: Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (line) => entries.push({ level, ...JSON.parse(line.slice('Q&A mail '.length)) })])) }
}

test('서버 시작 상태는 비활성·설정 누락·정상을 구분하고 값은 노출하지 않는다', () => {
  for (const [settings, expected, level] of [[{}, 'disabled', 'warn'], [{ ...env, KNOX_MAIL_TOKEN: '' }, 'configuration_failed', 'error'], [env, 'configured', 'info']]) {
    const { logger, entries } = captureLogger()
    createQnaMailNotifier({ env: settings, logger }).reportStartup()
    assert.equal(entries[0].state, expected)
    assert.equal(entries[0].level, level)
    assert.equal(entries[0].stage, 'startup')
    if (expected === 'configuration_failed') assert.deepEqual(entries[0].missingFields, ['KNOX_MAIL_TOKEN'])
    assert.doesNotMatch(JSON.stringify(entries), /secret-token|developer|portal.example/)
  }
})

test('등록 후 비활성 상태도 로그를 남기고 실제 발송은 하지 않는다', async () => {
  const { logger, entries } = captureLogger()
  await createQnaMailNotifier({ env: {}, logger, fetchImpl: () => assert.fail('발송 금지') }).notify(event)
  assert.equal(entries[0].state, 'skipped_disabled')
  assert.equal(entries[0].questionId, 7)
})

test('DB 준비 실패와 네트워크 실패는 오류 채널에 안전한 코드만 기록한다', async () => {
  const { logger, entries } = captureLogger()
  await createQnaMailNotifier({ env, logger }).notify({ ...event, repository: { async getMailContext() { throw Object.assign(new Error('secret SQL'), { code: 'ER_NO_SUCH_TABLE', sql: 'secret SQL' }) } } })
  assert.equal(entries[0].stage, 'recipient_and_content_query')
  assert.equal(entries[0].errorCode, 'ER_NO_SUCH_TABLE')
  assert.equal(entries[0].level, 'error')
  await createQnaMailNotifier({ env, logger, fetchImpl: async () => { throw new Error('secret URL', { cause: { code: 'ENOTFOUND' } }) } }).notify(event)
  assert.equal(entries.at(-1).state, 'failed')
  assert.equal(entries.at(-1).errorCode, 'ENOTFOUND')
  assert.equal(entries.at(-1).level, 'error')
  assert.doesNotMatch(JSON.stringify(entries), /secret/)
})
