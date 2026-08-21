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
