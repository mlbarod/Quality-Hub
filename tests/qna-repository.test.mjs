import assert from "node:assert/strict"
import test from "node:test"

import {
  createQnaRepository,
  normalizeTags,
  QnaPermissionError,
  sanitizeRichHtml,
} from "../server/qnaRepository.mjs"

const master = { userId: "quality.kim", displayName: "김품질", role: "master" }

test("Q&A 질문 등록은 본문 평문·태그·이력을 한 트랜잭션에 저장한다", async () => {
  const calls = []
  const connection = {
    async beginTransaction() { calls.push(["begin"]) },
    async execute(sql, parameters = []) {
      calls.push([sql, parameters])
      if (sql.includes("INSERT INTO quality_hub_qna_question (")) return [{ insertId: 31 }]
      return [{ affectedRows: 1 }]
    },
    async commit() { calls.push(["commit"]) },
    async rollback() { calls.push(["rollback"]) },
    release() { calls.push(["release"]) },
  }
  const repository = createQnaRepository({ pool: { async getConnection() { return connection } }, uuidFactory: () => "history-1" })
  const result = await repository.createQuestion({
    title: " DB 연동 질문 ",
    bodyHtml: '<p onclick="alert(1)"><strong>본문</strong>입니다.</p><script>bad()</script>',
    category: "Rule",
    lineName: "LINE_A",
    tags: [" #Rate ", "rate", "적용시점"],
  }, master)

  assert.deepEqual(result, { questionId: 31 })
  const insert = calls.find(([sql]) => String(sql).includes("INSERT INTO quality_hub_qna_question ("))
  assert.equal(insert[1][0], "DB 연동 질문")
  assert.doesNotMatch(insert[1][1], /onclick|script|bad/)
  assert.equal(insert[1][2], "본문 입니다.")
  const tagCalls = calls.filter(([sql]) => String(sql).includes("quality_hub_qna_question_tag"))
  assert.deepEqual(tagCalls.map(([, parameters]) => parameters), [[31, "Rate"], [31, "적용시점"]])
  assert.ok(calls.some(([value]) => value === "commit"))
  assert.ok(!calls.some(([value]) => value === "rollback"))
})

test("Q&A 스냅샷은 다섯 테이블을 게시판·알림·이력 화면 계약으로 조합한다", async () => {
  const createdAt = new Date("2026-08-21T01:02:03.000Z")
  const pool = {
    async execute(sql) {
      if (sql.includes("FROM quality_hub_qna_question\n")) return [[{
        questionId: 12, title: "질문", bodyHtml: "<p>본문</p>", bodyText: "본문", category: "FDC", lineName: "LINE_A",
        status: "active", authorUserId: "quality.kim", authorDisplayName: "김품질", finalMessageId: null,
        viewCount: 3, createdAt, updatedAt: createdAt, hiddenAt: null, hiddenByUserId: null,
      }]]
      if (sql.includes("FROM quality_hub_qna_message")) return [[{
        messageId: 21, questionId: 12, bodyHtml: "<p>답변</p>", bodyText: "답변", authorUserId: "process.park",
        authorDisplayName: "박공정", createdAt, updatedAt: createdAt, hiddenAt: null, hiddenByUserId: null,
        questionAuthorUserId: "quality.kim", finalMessageId: null,
      }]]
      if (sql.includes("FROM quality_hub_qna_question_tag")) return [[{ questionId: 12, tagName: "Rate" }]]
      if (sql.includes("FROM quality_hub_qna_notification")) return [[{
        notificationId: "notification-1", questionId: 12, eventType: "reply_created", readAt: null, createdAt, title: "질문", questionCreatedAt: createdAt,
      }]]
      if (sql.includes("FROM quality_hub_qna_history")) return [[{
        historyId: "history-1", questionId: 12, messageId: 21, actionType: "message_created", actorDisplayName: "박공정", detailJson: null, createdAt, title: "질문",
      }]]
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
  const snapshot = await createQnaRepository({ pool }).getSnapshot(master)

  assert.equal(snapshot.posts[0].id, "Q-2026-012")
  assert.equal(snapshot.posts[0].excerpt, "본문")
  assert.deepEqual(snapshot.posts[0].tags, ["Rate"])
  assert.equal(snapshot.posts[0].messages[0].body, "답변")
  assert.equal(snapshot.notifications[0].postId, "Q-2026-012")
  assert.equal(snapshot.notifications[0].read, false)
  assert.equal(snapshot.history[0].action, "답변 등록")
})

test("Q&A 상태 변경 권한 오류는 트랜잭션을 롤백한다", async () => {
  const events = []
  const connection = {
    async beginTransaction() { events.push("begin") },
    async execute(sql) {
      if (sql.includes("FROM quality_hub_qna_question")) return [[{ questionId: 1, authorUserId: "owner", hiddenAt: null }]]
      return [{ affectedRows: 1 }]
    },
    async commit() { events.push("commit") },
    async rollback() { events.push("rollback") },
    release() { events.push("release") },
  }
  const repository = createQnaRepository({ pool: { async getConnection() { return connection } } })

  await assert.rejects(
    repository.updateQuestion(1, { operation: "status", status: "completed" }, { userId: "general", displayName: "일반", role: "general" }),
    QnaPermissionError,
  )
  assert.deepEqual(events, ["begin", "rollback", "release"])
})

test("Q&A 입력 정규화는 위험 HTML과 중복 태그를 제거하고 제한을 검사한다", () => {
  assert.doesNotMatch(sanitizeRichHtml('<p onmouseover="x()">안전</p><iframe src="x"></iframe>'), /onmouseover|iframe/)
  assert.deepEqual(normalizeTags(["#Rate", " rate ", "식각"]), ["Rate", "식각"])
  assert.throws(() => normalizeTags(["1", "2", "3", "4", "5", "6"]), /최대 5개/)
})

test("메일은 공개 질문·답변과 개별 관리자·마스터를 조회하고 부서 규칙은 별도로 표시한다", async () => {
  const calls = []
  const repository = createQnaRepository({ pool: { async execute(sql, params) {
    calls.push([sql, params])
    if (sql.includes('FROM quality_hub_qna_question')) return [[{ questionId: 7, title: '질문' }]]
    if (sql.includes('FROM quality_hub_qna_message')) return [[{ bodyHtml: '<p>답변</p>' }]]
    if (sql.includes('UNION')) return [[{ userId: 'admin' }, { userId: 'master' }]]
    if (sql.includes('COUNT(*)')) return [[{ count: 1 }]]
    throw new Error('unexpected query')
  } } })
  const result = await repository.getMailContext(7, 9)
  assert.deepEqual(result.recipientUserIds, ['admin', 'master'])
  assert.equal(result.departmentRuleCount, 1)
  assert.equal(result.message.bodyHtml, '<p>답변</p>')
  assert.deepEqual(calls[1][1], [7, 9])
  assert.match(calls[2][0], /is_active = 1 AND role_name = 'admin' AND claim_field = 'user_id' AND match_type = 'exact'/)
  assert.match(calls[0][0], /hidden_at IS NULL/)
})

test('목록 요약은 HTML을 DB에서 가져오지 않고 검색용 텍스트를 유지한다', async () => {
  const queries = []
  const repository = createQnaRepository({ pool: { async execute(sql) {
    queries.push(sql)
    if (sql.includes('FROM quality_hub_qna_question\n')) return [[{ questionId: 7, title: '질문', bodyHtml: null, bodyText: '본문 검색어', createdAt: '2026-09-11', updatedAt: '2026-09-11' }]]
    return [[]]
  } } })
  const result = await repository.getSnapshot(master, { summary: true })
  assert.equal(result.posts[0].detailLoaded, false)
  assert.equal(result.posts[0].bodyText, '본문 검색어')
  assert.equal(result.posts[0].content, null)
  assert.match(queries[0], /NULL AS bodyHtml/)
  assert.match(queries[1], /NULL AS bodyHtml/)
  assert.doesNotMatch(queries.join('\n'), /body_html/)
})

test('단일 상세는 질문 ID로 세 쿼리를 한정하며 알림과 전체 이력을 재조회하지 않는다', async () => {
  const queries = []
  const repository = createQnaRepository({ pool: { async execute(sql, params) { queries.push([sql, params]); return [[]] } } })
  await repository.getSnapshot({ ...master, role: 'general' }, { questionId: 7 })
  assert.equal(queries.length, 3)
  for (const [sql, params] of queries) {
    assert.deepEqual(params, [7])
    assert.match(sql, /question_id = \?/)
    assert.match(sql, /hidden_at IS NULL/)
  }
})

test('질문 등록 결과에 DB 저장에 사용한 정제된 상세를 포함하고 추가 조회하지 않는다', async () => {
  const calls = []
  const repository = createQnaRepository({ pool: { async execute(sql, params) { calls.push([sql, params]); return [{ insertId: 33 }] } } })
  const result = await repository.createQuestion({ title: '제목', bodyHtml: '<p>본문</p><script>secret()</script>', category: 'FDC', lineName: 'A', tags: [] }, master, { includePost: true })
  assert.equal(result.post.questionId, 33)
  assert.equal(result.post.detailLoaded, true)
  assert.equal(result.post.content, '<p>본문</p>')
  assert.ok(Number.isFinite(Date.parse(result.post.createdAt)))
  assert.match(calls[0][0], /CURRENT_TIMESTAMP/)
  assert.ok(calls.every(([sql]) => !sql.includes('SELECT')))
})

test('이미지 포함 본문은 15MB 바이트 한도로 검사하며 큰 사진을 보존한다', () => {
  const html = '<p>사진 설명</p><img src="data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024) + '">'
  assert.equal(sanitizeRichHtml(html), html)
  assert.throws(() => sanitizeRichHtml('가'.repeat(6 * 1024 * 1024)), (error) => error.code === 'BODY_TOO_LARGE')
  assert.throws(() => sanitizeRichHtml('a'.repeat(15 * 1024 * 1024 + 1)), (error) => error.code === 'BODY_TOO_LARGE')
})
