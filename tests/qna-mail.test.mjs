import assert from 'node:assert/strict'
import test from 'node:test'
import { buildQnaMail, createQnaMailNotifier, loadQnaMailConfig, richHtmlToMailText } from '../server/qnaMail.mjs'
import { richHtmlToMailHtml } from '../server/qnaMailHtml.mjs'
import { parseFragment } from 'parse5'

const env = { KNOX_MAIL_ENABLED: 'true', KNOX_MAIL_USER_ID: 'developer', KNOX_MAIL_TOKEN: 'secret-token', KNOX_MAIL_SYSTEM_ID: 'system', KNOX_MAIL_PORTAL_URL: 'https://portal.example/hub/' }
const data = { question: { questionId: 7, title: '질문 제목', category: 'FDC', lineName: 'A', bodyHtml: '<p>첫째 &amp; 내용</p><p>둘째<br>셋째</p>' }, message: { bodyHtml: '<p>추가 내용</p>' }, recipientUserIds: ['author', 'master', 'MASTER'] }
const actor = { userId: 'author', displayName: '작성자' }
const event = { repository: { async getMailContext() { return data } }, eventType: 'question_created', questionId: 7, actor }

test('환경변수 비활성화와 누락·잘못된 설정을 구분한다', () => {
  assert.equal(loadQnaMailConfig({}), null)
  for (const key of ['KNOX_MAIL_TOKEN', 'KNOX_MAIL_SYSTEM_ID', 'KNOX_MAIL_PORTAL_URL']) assert.throws(() => loadQnaMailConfig({ ...env, [key]: '' }))
  assert.throws(() => loadQnaMailConfig({ ...env, KNOX_MAIL_PORTAL_URL: 'javascript:alert(1)' }))
  assert.throws(() => loadQnaMailConfig({ ...env, KNOX_MAIL_TIMEOUT_MS: '-1' }))
})

test('지정 제목, 본문 줄바꿈, 링크와 본인 포함 중복 없는 수신자를 만든다', () => {
  const payload = buildQnaMail(loadQnaMailConfig(env), { ...data, actor, eventType: 'question_created' })
  assert.equal(payload.subject, '[품질 Hub VOE] 게시글 등록:질문 제목')
  assert.equal(payload.sender.emailAddress, 'author@samsung.com')
  assert.deepEqual(payload.recipients, [{ emailAddress: 'author@samsung.com', recipientType: 'TO' }, { emailAddress: 'master@samsung.com', recipientType: 'TO' }])
  assert.equal(payload.contentType, 'HTML')
  assert.match(payload.contents, /href="https:\/\/portal.example\/hub\/\?qna=open&amp;questionId=7"/)
  assert.match(payload.contents, /질문 본문<\/h2>[\s\S]*<p[^>]*>첫째 &amp; 내용<\/p><p[^>]*>둘째<br>셋째<\/p>/)
  assert.doesNotMatch(payload.contents, /추가 답변|border-top:3px/)
  const reply = buildQnaMail(loadQnaMailConfig(env), { ...data, actor, eventType: 'message_created' })
  assert.equal(reply.subject, '[품질 Hub VOE] 추가 답변: 질문 제목')
  for (const mail of [payload, reply]) {
    const nodes = []
    const visit = (node) => { nodes.push(node); for (const child of node.childNodes ?? []) visit(child) }
    visit(parseFragment(mail.contents))
    const anchor = nodes.find((node) => node.tagName === 'a')
    const attrs = Object.fromEntries(anchor.attrs.map(({ name, value }) => [name, value]))
    const expectedUrl = 'https://portal.example/hub/?qna=open&questionId=7'
    assert.equal(attrs.href, expectedUrl)
    assert.equal(anchor.childNodes[0].value, expectedUrl)
    assert.equal(attrs.target, '_blank')
    assert.equal(attrs.rel, 'noopener noreferrer')
  }
  assert.match(reply.contents, /질문 본문[\s\S]*<hr style="[^"]*border-top:3px solid #6c91aa;">[\s\S]*추가 답변<\/h2>[\s\S]*<p[^>]*>추가 내용<\/p>/)
  assert.equal(richHtmlToMailText('<script>secret</script><p>&#x1f600; &#99999999;</p><img src="data:secret">'), '😀 �\n[이미지: 게시글에서 확인]')
})

test('본문 서식과 표 병합·목록 시작 번호를 유지하고 이미지 데이터는 제외한다', () => {
  const html = richHtmlToMailHtml('<h2>제목</h2><p><strong>강조</strong><em>기울임</em><s>취소</s><u>밑줄</u><br>다음 줄</p><ul><li>목록</li></ul><ol start="3"><li>셋째</li></ol><blockquote>인용</blockquote><pre><code>&lt;내용&gt;</code></pre><table><tbody><tr><th colspan="2">항목</th></tr><tr><td rowspan="2">값</td><td>결과</td></tr></tbody></table><p><img src="data:image/png;base64,SECRET"><img src="https://images.example/private.png"></p><a href="/guide?a=1&amp;b=2">참고</a>', env.KNOX_MAIL_PORTAL_URL)
  for (const tag of ['h2', 'strong', 'em', 's', 'u', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'th', 'td']) assert.match(html, new RegExp(`<${tag} style="`))
  assert.match(html, /start="3"/)
  assert.match(html, /colspan="2"/)
  assert.match(html, /rowspan="2"/)
  assert.match(html, /href="https:\/\/portal.example\/guide\?a=1&amp;b=2"/)
  assert.match(html, /&lt;내용&gt;/)
  assert.equal(html.match(/\[이미지: 게시글에서 확인\]/g).length, 2)
  assert.doesNotMatch(html, /<img|SECRET|images.example|data:image/)
})

test('임의 HTML 속성·스크립트·외부 리소스를 제거하고 표시값을 이스케이프한다', () => {
  const html = richHtmlToMailHtml('<script>SECRET</script><style>SECRET</style><svg><image href="SECRET"/></svg><iframe src="SECRET"></iframe><p style="background:url(SECRET)" onclick="SECRET">본문</p><a href="java&#x73;cript:alert(1)">링크</a><a href="data:text/html,SECRET">데이터</a><img src="x" onerror="SECRET"><!--SECRET-->', env.KNOX_MAIL_PORTAL_URL)
  assert.doesNotMatch(html, /SECRET|onclick|onerror|javascript|data:|<script|<style|<svg|<iframe|<img/)
  const payload = buildQnaMail(loadQnaMailConfig(env), { ...data, question: { ...data.question, category: '<img src=x>', lineName: 'A&B' }, actor: { ...actor, displayName: '<b>이름</b>' }, eventType: 'question_created' })
  assert.match(payload.contents, /&lt;b&gt;이름&lt;\/b&gt;/)
  assert.match(payload.contents, /&lt;img src=x&gt;/)
  assert.match(payload.contents, /A&amp;B/)
  const broken = richHtmlToMailHtml('<table><tr><td><strong>내용</table><p>마지막<img src="secret">', env.KNOX_MAIL_PORTAL_URL)
  assert.doesNotThrow(() => parseFragment(broken))
  assert.match(broken, /내용[\s\S]*마지막/)
  assert.doesNotMatch(broken, /<img|secret/)
})

test('API URL과 발신자는 작성자이며 HTTP 접수는 검증 대기로 기록한다', async () => {
  const logs = []
  await createQnaMailNotifier({ env, logger: { info: (line) => logs.push(JSON.parse(line.slice('Q&A mail '.length))) }, fetchImpl: async (url, init) => {
    assert.equal(url.searchParams.get('userId'), 'author')
    assert.equal(init.method, 'POST')
    assert.equal(init.headers.Authorization, 'Bearer secret-token')
    assert.equal(init.headers['System-ID'], 'system')
    assert.equal(init.redirect, 'error')
    assert.equal(JSON.parse(init.body).sender.emailAddress, 'author@samsung.com')
    assert.equal(JSON.parse(init.body).contentType, 'HTML')
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


test('고정 사용자 ID가 없어도 설정이 유효하고 기존 값은 사용하지 않는다', () => {
  const { KNOX_MAIL_USER_ID, ...withoutFixedUser } = env
  assert.deepEqual(loadQnaMailConfig(withoutFixedUser), loadQnaMailConfig(env))
  assert.deepEqual(loadQnaMailConfig({ ...env, KNOX_MAIL_USER_ID: '다른 값\n' }), loadQnaMailConfig(env))
  const { logger, entries } = captureLogger()
  createQnaMailNotifier({ env: withoutFixedUser, logger }).reportStartup()
  assert.equal(entries[0].state, 'configured')
  assert.equal(entries[0].senderSource, 'actor')
})

test('회귀: 개발자와 다른 일반유저·관리자·마스터도 URL과 발신자를 일치시켜 질문과 답변을 보낸다', async () => {
  const { logger, entries } = captureLogger()
  const sent = []
  const notifier = createQnaMailNotifier({ env, logger, fetchImpl: async (url, init) => {
    const payload = JSON.parse(init.body)
    const userId = url.searchParams.get('userId')
    // 현장 증상에 대한 재현 조건: 호출 사용자와 발신자가 다르면 거절한다.
    if (payload.sender.emailAddress !== `${userId}@samsung.com`) return new Response(null, { status: 403 })
    sent.push({ userId, payload })
    return new Response(null, { status: 202 })
  } })
  const authors = [['general', 'general.writer'], ['admin', 'admin.writer'], ['master', 'master.writer']]
  await Promise.all(authors.flatMap(([role, userId]) => ['question_created', 'message_created'].map((eventType) => notifier.notify({
    ...event, eventType, ...(eventType === 'message_created' ? { messageId: 9 } : {}),
    actor: { userId: ` ${userId.toUpperCase()} `, displayName: '다른 작성자', role },
    repository: { async getMailContext() { return { ...data, question: { ...data.question, authorUserId: 'original.author' }, recipientUserIds: ['admin.writer', 'master.writer'] } } },
  }))))
  assert.equal(sent.length, 6)
  for (const [, userId] of authors) {
    const mails = sent.filter((mail) => mail.userId === userId)
    assert.equal(mails.length, 2)
    assert.ok(mails.some(({ payload }) => payload.subject.startsWith('[품질 Hub VOE] 추가 답변:')))
    for (const { payload } of mails) assert.deepEqual(payload.recipients.map((recipient) => recipient.emailAddress), ['admin.writer@samsung.com', 'master.writer@samsung.com'])
  }
  assert.equal(entries.filter((entry) => entry.state === 'http_accepted_response_unverified').length, 6)
  assert.doesNotMatch(JSON.stringify(entries), /secret-token|developer|writer@samsung.com/)
})

test('작성자 ID가 없거나 잘못되면 설정 ID로 대신 발송하지 않는다', async () => {
  for (const userId of ['', undefined, 'wrong@example.com', 'bad&id']) {
    const { logger, entries } = captureLogger()
    await createQnaMailNotifier({ env, logger, fetchImpl: () => assert.fail('잘못된 작성자로 발송 금지') }).notify({ ...event, actor: { ...actor, userId } })
    assert.equal(entries[0].state, 'preparation_failed')
    assert.equal(entries[0].reason, 'invalid_knox_id')
  }
})
