import { randomUUID } from "node:crypto"

import mysql from "mysql2/promise"

import { loadDbConfig } from "./conversationHistoryRepository.mjs"

const QUESTION_CATEGORIES = new Set(["Rule", "SPC", "FDC", "TTTM", "Report", "WF Loss", "미분류"])
const QUESTION_STATUSES = new Set(["waiting", "active", "completed"])
const PRIVILEGED_ROLES = new Set(["master", "admin"])

const ACTION_LABELS = {
  question_created: "질문 등록",
  question_updated: "질문 수정",
  question_hidden: "질문 삭제",
  question_restored: "질문 복구",
  message_created: "답변 등록",
  message_updated: "답변 수정",
  message_hidden: "답변 삭제",
  message_restored: "답변 복구",
  status_changed: "상태 변경",
  final_selected: "최종 답변 지정",
}

function requireText(value, fieldName, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${fieldName} 값을 입력해 주세요.`)
  const normalized = value.trim().normalize("NFKC")
  if (normalized.length > maxLength) throw new TypeError(`${fieldName} 값은 ${maxLength}자 이하여야 합니다.`)
  return normalized
}

function requireId(value, fieldName) {
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized) || normalized <= 0) throw new TypeError(`${fieldName} 값이 올바르지 않습니다.`)
  return normalized
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim()
}

export function sanitizeRichHtml(value) {
  const html = requireText(value, "bodyHtml", 500_000)
  const withoutDangerousNodes = html
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link)\b[^>]*\/?\s*>/gi, "")
  return withoutDangerousNodes
    .replace(/\s+(?:on[a-z]+|style|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (attribute, name, rawValue) => {
      const value = rawValue.replace(/^["']|["']$/g, "").trim()
      const isSafeHref = name.toLowerCase() === "href" && /^(?:https?:|mailto:|#|\/)/i.test(value)
      const isSafeSrc = name.toLowerCase() === "src" && /^(?:https?:|data:image\/(?:png|jpeg|gif|webp);base64,|blob:|\/)/i.test(value)
      return isSafeHref || isSafeSrc ? attribute : ""
    })
}

export function normalizeTags(tags) {
  if (tags === undefined) return []
  if (!Array.isArray(tags)) throw new TypeError("tags 값은 배열이어야 합니다.")
  const seen = new Set()
  const normalized = []
  for (const rawTag of tags) {
    const tag = String(rawTag ?? "").trim().replace(/^#+/, "").trim().normalize("NFKC")
    if (!tag) continue
    if (tag.length > 50) throw new TypeError("태그는 50자 이하여야 합니다.")
    const key = tag.toLocaleLowerCase("ko-KR")
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(tag)
  }
  if (normalized.length > 5) throw new TypeError("태그는 최대 5개까지 입력할 수 있습니다.")
  return normalized
}

function normalizeActor(actor) {
  if (!actor || typeof actor !== "object") throw new TypeError("사용자 정보가 필요합니다.")
  const role = requireText(actor.role, "role", 20)
  if (!["master", "admin", "general"].includes(role)) throw new TypeError("Q&A를 사용할 권한이 없습니다.")
  return {
    userId: requireText(actor.userId, "userId", 100),
    displayName: requireText(actor.displayName, "displayName", 100),
    role,
  }
}

function questionInput(input) {
  const category = requireText(input?.category, "category", 30)
  if (!QUESTION_CATEGORIES.has(category)) throw new TypeError("category 값이 올바르지 않습니다.")
  const bodyHtml = sanitizeRichHtml(input?.bodyHtml)
  const bodyText = stripHtml(bodyHtml)
  if (!bodyText) throw new TypeError("질문 본문을 입력해 주세요.")
  return {
    title: requireText(input?.title, "title", 255),
    bodyHtml,
    bodyText,
    category,
    lineName: requireText(input?.lineName, "lineName", 100),
    tags: normalizeTags(input?.tags),
  }
}

function messageInput(input) {
  const bodyHtml = sanitizeRichHtml(input?.bodyHtml)
  const bodyText = stripHtml(bodyHtml)
  if (!bodyText) throw new TypeError("답변 내용을 입력해 주세요.")
  return { bodyHtml, bodyText }
}

async function withTransaction(pool, work) {
  if (typeof pool.getConnection !== "function") return work(pool)
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function insertHistory(connection, { questionId, messageId = null, actionType, actor, detail = null, uuidFactory }) {
  await connection.execute(`
    INSERT INTO quality_hub_qna_history (
      history_id, question_id, message_id, action_type,
      actor_user_id, actor_display_name, detail_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
  `, [uuidFactory(), questionId, messageId, actionType, actor.userId, actor.displayName, detail ? JSON.stringify(detail) : null])
}

async function insertNotification(connection, { questionId, recipientUserId, actorUserId, eventType, uuidFactory }) {
  if (!recipientUserId || recipientUserId === actorUserId) return
  await connection.execute(`
    INSERT INTO quality_hub_qna_notification (
      notification_id, recipient_user_id, question_id, event_type, read_at, created_at
    ) VALUES (?, ?, ?, ?, NULL, CURRENT_TIMESTAMP(3))
  `, [uuidFactory(), recipientUserId, questionId, eventType])
}

async function lockQuestion(connection, questionId) {
  const [rows] = await connection.execute(`
    SELECT question_id AS questionId, title, author_user_id AS authorUserId,
      author_display_name AS authorDisplayName, status, final_message_id AS finalMessageId,
      hidden_at AS hiddenAt
    FROM quality_hub_qna_question
    WHERE question_id = ?
    FOR UPDATE
  `, [questionId])
  if (!rows[0]) throw new QnaNotFoundError("질문")
  return rows[0]
}

async function lockMessage(connection, questionId, messageId) {
  const [rows] = await connection.execute(`
    SELECT message_id AS messageId, question_id AS questionId,
      author_user_id AS authorUserId, author_display_name AS authorDisplayName,
      hidden_at AS hiddenAt
    FROM quality_hub_qna_message
    WHERE question_id = ? AND message_id = ?
    FOR UPDATE
  `, [questionId, messageId])
  if (!rows[0]) throw new QnaNotFoundError("답변")
  return rows[0]
}

function assertQuestionOwner(question, actor, { allowPrivileged = false } = {}) {
  if (question.authorUserId === actor.userId) return
  if (allowPrivileged && actor.role === "master") return
  throw new QnaPermissionError()
}

function assertMessageOwner(message, actor) {
  if (message.authorUserId === actor.userId || actor.role === "master") return
  throw new QnaPermissionError()
}

function formatDate(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value).replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/, "$1T$2")
}

function buildQuestionCode(questionId, createdAt) {
  const storedYear = Number(String(createdAt ?? "").slice(0, 4))
  const year = Number.isInteger(storedYear) && storedYear >= 2000 ? storedYear : new Date(createdAt).getFullYear()
  return `Q-${Number.isFinite(year) ? year : new Date().getFullYear()}-${String(questionId).padStart(3, "0")}`
}

function toPosts(questionRows, messageRows, tagRows) {
  const messagesByQuestion = new Map()
  for (const row of messageRows) {
    const message = {
      id: String(row.messageId),
      messageId: Number(row.messageId),
      author: row.authorDisplayName,
      authorUserId: row.authorUserId,
      role: row.authorUserId === row.questionAuthorUserId ? "질문자" : "답변·댓글",
      time: formatDate(row.createdAt),
      body: row.bodyText,
      content: row.bodyHtml,
      isFinal: Number(row.messageId) === Number(row.finalMessageId),
      hidden: Boolean(row.hiddenAt),
      hiddenAt: formatDate(row.hiddenAt),
      hiddenBy: row.hiddenByUserId,
    }
    const entries = messagesByQuestion.get(Number(row.questionId)) ?? []
    entries.push(message)
    messagesByQuestion.set(Number(row.questionId), entries)
  }
  const tagsByQuestion = new Map()
  for (const row of tagRows) {
    const entries = tagsByQuestion.get(Number(row.questionId)) ?? []
    entries.push(row.tagName)
    tagsByQuestion.set(Number(row.questionId), entries)
  }
  return questionRows.map((row) => ({
    id: buildQuestionCode(Number(row.questionId), row.createdAt),
    questionId: Number(row.questionId),
    title: row.title,
    excerpt: String(row.bodyText ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
    category: row.category,
    line: row.lineName,
    tags: tagsByQuestion.get(Number(row.questionId)) ?? [],
    status: row.status,
    author: row.authorDisplayName,
    authorUserId: row.authorUserId,
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
    views: Number(row.viewCount ?? 0),
    content: row.bodyHtml,
    attachments: [],
    messages: messagesByQuestion.get(Number(row.questionId)) ?? [],
    hidden: Boolean(row.hiddenAt),
    hiddenAt: formatDate(row.hiddenAt),
    hiddenBy: row.hiddenByUserId,
  }))
}

function notificationCopy(eventType) {
  if (eventType === "final_selected") return { title: "최종 답변이 지정되었습니다", icon: "complete" }
  if (eventType === "status_changed") return { title: "질문 상태가 변경되었습니다", icon: "complete" }
  return { title: "답변이 등록되었습니다", icon: "reply" }
}

export class QnaNotFoundError extends Error {
  constructor(target = "항목") {
    super(`${target}을(를) 찾을 수 없습니다.`)
    this.name = "QnaNotFoundError"
  }
}

export class QnaPermissionError extends Error {
  constructor() {
    super("이 Q&A 작업을 수행할 권한이 없습니다.")
    this.name = "QnaPermissionError"
  }
}

export function createQnaPool({ config = loadDbConfig(), mysqlImpl = mysql } = {}) {
  return mysqlImpl.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    dateStrings: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  })
}

export function createQnaRepository({ pool = createQnaPool(), uuidFactory = randomUUID } = {}) {
  return {
    async getSnapshot(actorInput) {
      const actor = normalizeActor(actorInput)
      const includeHidden = actor.role === "master"
      const [questionResult, messageResult, tagResult, notificationResult, historyResult] = await Promise.all([
        pool.execute(`
          SELECT question_id AS questionId, title, body_html AS bodyHtml, body_text AS bodyText,
            category, line_name AS lineName, status, author_user_id AS authorUserId,
            author_display_name AS authorDisplayName, final_message_id AS finalMessageId,
            view_count AS viewCount, created_at AS createdAt, updated_at AS updatedAt,
            hidden_at AS hiddenAt, hidden_by_user_id AS hiddenByUserId
          FROM quality_hub_qna_question
          ${includeHidden ? "" : "WHERE hidden_at IS NULL"}
          ORDER BY created_at DESC, question_id DESC
        `),
        pool.execute(`
          SELECT m.message_id AS messageId, m.question_id AS questionId,
            m.body_html AS bodyHtml, m.body_text AS bodyText,
            m.author_user_id AS authorUserId, m.author_display_name AS authorDisplayName,
            m.created_at AS createdAt, m.updated_at AS updatedAt,
            m.hidden_at AS hiddenAt, m.hidden_by_user_id AS hiddenByUserId,
            q.author_user_id AS questionAuthorUserId, q.final_message_id AS finalMessageId
          FROM quality_hub_qna_message m
          INNER JOIN quality_hub_qna_question q ON q.question_id = m.question_id
          ${includeHidden ? "" : "WHERE q.hidden_at IS NULL AND m.hidden_at IS NULL"}
          ORDER BY m.question_id, m.created_at, m.message_id
        `),
        pool.execute(`
          SELECT t.question_id AS questionId, t.tag_name AS tagName
          FROM quality_hub_qna_question_tag t
          INNER JOIN quality_hub_qna_question q ON q.question_id = t.question_id
          ${includeHidden ? "" : "WHERE q.hidden_at IS NULL"}
          ORDER BY t.question_id, t.tag_name
        `),
        pool.execute(`
          SELECT n.notification_id AS notificationId, n.question_id AS questionId,
            n.event_type AS eventType, n.read_at AS readAt, n.created_at AS createdAt,
            q.title, q.created_at AS questionCreatedAt
          FROM quality_hub_qna_notification n
          INNER JOIN quality_hub_qna_question q ON q.question_id = n.question_id
          WHERE n.recipient_user_id = ?
          ORDER BY n.created_at DESC
          LIMIT 100
        `, [actor.userId]),
        actor.role === "master" ? pool.execute(`
          SELECT h.history_id AS historyId, h.question_id AS questionId,
            h.message_id AS messageId, h.action_type AS actionType,
            h.actor_display_name AS actorDisplayName, h.detail_json AS detailJson,
            h.created_at AS createdAt, q.title
          FROM quality_hub_qna_history h
          INNER JOIN quality_hub_qna_question q ON q.question_id = h.question_id
          ORDER BY h.created_at DESC
          LIMIT 200
        `) : Promise.resolve([[]]),
      ])
      const posts = toPosts(questionResult[0], messageResult[0], tagResult[0])
      const postCodes = new Map(posts.map((post) => [post.questionId, post.id]))
      return {
        posts,
        notifications: notificationResult[0].map((row) => ({
          id: row.notificationId,
          postId: postCodes.get(Number(row.questionId)) ?? buildQuestionCode(Number(row.questionId), row.questionCreatedAt),
          questionId: Number(row.questionId),
          ...notificationCopy(row.eventType),
          detail: row.title,
          time: formatDate(row.createdAt),
          read: Boolean(row.readAt),
        })),
        history: historyResult[0].map((row) => ({
          id: row.historyId,
          action: ACTION_LABELS[row.actionType] ?? row.actionType,
          targetName: row.title,
          actor: row.actorDisplayName,
          detail: typeof row.detailJson === "string" ? row.detailJson : row.detailJson ? JSON.stringify(row.detailJson) : "",
          occurredAt: formatDate(row.createdAt),
        })),
      }
    },

    async createQuestion(input, actorInput) {
      const actor = normalizeActor(actorInput)
      const question = questionInput(input)
      return withTransaction(pool, async (connection) => {
        const [result] = await connection.execute(`
          INSERT INTO quality_hub_qna_question (
            title, body_html, body_text, category, line_name, status,
            author_user_id, author_display_name, final_message_id, view_count,
            created_at, updated_at, hidden_at, hidden_by_user_id
          ) VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?, NULL, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL, NULL)
        `, [question.title, question.bodyHtml, question.bodyText, question.category, question.lineName, actor.userId, actor.displayName])
        const questionId = Number(result.insertId)
        for (const tag of question.tags) {
          await connection.execute("INSERT INTO quality_hub_qna_question_tag (question_id, tag_name) VALUES (?, ?)", [questionId, tag])
        }
        await insertHistory(connection, { questionId, actionType: "question_created", actor, uuidFactory })
        return { questionId }
      })
    },

    async updateQuestion(questionIdInput, input, actorInput) {
      const questionId = requireId(questionIdInput, "questionId")
      const actor = normalizeActor(actorInput)
      return withTransaction(pool, async (connection) => {
        const current = await lockQuestion(connection, questionId)
        if (input?.operation === "view") {
          if (current.hiddenAt) throw new QnaNotFoundError("질문")
          await connection.execute("UPDATE quality_hub_qna_question SET view_count = view_count + 1 WHERE question_id = ?", [questionId])
          return { updated: true }
        }
        if (input?.operation === "status") {
          if (!PRIVILEGED_ROLES.has(actor.role)) throw new QnaPermissionError()
          const status = requireText(input.status, "status", 20)
          if (!QUESTION_STATUSES.has(status)) throw new TypeError("status 값이 올바르지 않습니다.")
          await connection.execute("UPDATE quality_hub_qna_question SET status = ?, final_message_id = IF(? = 'completed', final_message_id, NULL), updated_at = CURRENT_TIMESTAMP(3) WHERE question_id = ?", [status, status, questionId])
          await insertNotification(connection, { questionId, recipientUserId: current.authorUserId, actorUserId: actor.userId, eventType: "status_changed", uuidFactory })
          await insertHistory(connection, { questionId, actionType: "status_changed", actor, detail: { status }, uuidFactory })
          return { updated: true }
        }
        if (input?.operation === "final") {
          if (!PRIVILEGED_ROLES.has(actor.role)) throw new QnaPermissionError()
          const messageId = requireId(input.messageId, "messageId")
          const message = await lockMessage(connection, questionId, messageId)
          if (message.hiddenAt) throw new QnaNotFoundError("답변")
          await connection.execute("UPDATE quality_hub_qna_question SET final_message_id = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP(3) WHERE question_id = ?", [messageId, questionId])
          await insertNotification(connection, { questionId, recipientUserId: current.authorUserId, actorUserId: actor.userId, eventType: "final_selected", uuidFactory })
          await insertHistory(connection, { questionId, messageId, actionType: "final_selected", actor, uuidFactory })
          return { updated: true }
        }
        if (input?.operation === "hide") {
          if (actor.role !== "master") {
            assertQuestionOwner(current, actor)
            const [rows] = await connection.execute("SELECT COUNT(*) AS messageCount FROM quality_hub_qna_message WHERE question_id = ? AND hidden_at IS NULL", [questionId])
            if (Number(rows[0]?.messageCount ?? 0) > 0) throw new QnaPermissionError()
          }
          await connection.execute("UPDATE quality_hub_qna_question SET hidden_at = CURRENT_TIMESTAMP(3), hidden_by_user_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE question_id = ?", [actor.userId, questionId])
          await insertHistory(connection, { questionId, actionType: "question_hidden", actor, uuidFactory })
          return { updated: true }
        }
        if (input?.operation === "restore") {
          if (actor.role !== "master") throw new QnaPermissionError()
          await connection.execute("UPDATE quality_hub_qna_question SET hidden_at = NULL, hidden_by_user_id = NULL, updated_at = CURRENT_TIMESTAMP(3) WHERE question_id = ?", [questionId])
          await insertHistory(connection, { questionId, actionType: "question_restored", actor, uuidFactory })
          return { updated: true }
        }
        assertQuestionOwner(current, actor, { allowPrivileged: true })
        const title = requireText(input?.title, "title", 255)
        const bodyHtml = sanitizeRichHtml(input?.bodyHtml)
        const bodyText = stripHtml(bodyHtml)
        if (!bodyText) throw new TypeError("질문 본문을 입력해 주세요.")
        await connection.execute(`
          UPDATE quality_hub_qna_question
          SET title = ?, body_html = ?, body_text = ?, updated_at = CURRENT_TIMESTAMP(3)
          WHERE question_id = ?
        `, [title, bodyHtml, bodyText, questionId])
        await insertHistory(connection, { questionId, actionType: "question_updated", actor, uuidFactory })
        return { updated: true }
      })
    },

    async createMessage(questionIdInput, input, actorInput) {
      const questionId = requireId(questionIdInput, "questionId")
      const actor = normalizeActor(actorInput)
      const message = messageInput(input)
      return withTransaction(pool, async (connection) => {
        const question = await lockQuestion(connection, questionId)
        if (question.hiddenAt) throw new QnaNotFoundError("질문")
        const [result] = await connection.execute(`
          INSERT INTO quality_hub_qna_message (
            question_id, body_html, body_text, author_user_id, author_display_name,
            created_at, updated_at, hidden_at, hidden_by_user_id
          ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL, NULL)
        `, [questionId, message.bodyHtml, message.bodyText, actor.userId, actor.displayName])
        const messageId = Number(result.insertId)
        await connection.execute("UPDATE quality_hub_qna_question SET status = IF(status = 'waiting', 'active', status), updated_at = CURRENT_TIMESTAMP(3) WHERE question_id = ?", [questionId])
        await insertNotification(connection, { questionId, recipientUserId: question.authorUserId, actorUserId: actor.userId, eventType: "reply_created", uuidFactory })
        await insertHistory(connection, { questionId, messageId, actionType: "message_created", actor, uuidFactory })
        return { messageId }
      })
    },

    async updateMessage(questionIdInput, messageIdInput, input, actorInput) {
      const questionId = requireId(questionIdInput, "questionId")
      const messageId = requireId(messageIdInput, "messageId")
      const actor = normalizeActor(actorInput)
      return withTransaction(pool, async (connection) => {
        const question = await lockQuestion(connection, questionId)
        const current = await lockMessage(connection, questionId, messageId)
        if (input?.operation === "hide") {
          assertMessageOwner(current, actor)
          await connection.execute("UPDATE quality_hub_qna_message SET hidden_at = CURRENT_TIMESTAMP(3), hidden_by_user_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE message_id = ?", [actor.userId, messageId])
          if (Number(question.finalMessageId) === messageId) {
            const [rows] = await connection.execute("SELECT COUNT(*) AS messageCount FROM quality_hub_qna_message WHERE question_id = ? AND message_id <> ? AND hidden_at IS NULL", [questionId, messageId])
            const status = Number(rows[0]?.messageCount ?? 0) > 0 ? "active" : "waiting"
            await connection.execute("UPDATE quality_hub_qna_question SET final_message_id = NULL, status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE question_id = ?", [status, questionId])
          }
          await insertHistory(connection, { questionId, messageId, actionType: "message_hidden", actor, uuidFactory })
          return { updated: true }
        }
        if (input?.operation === "restore") {
          if (actor.role !== "master") throw new QnaPermissionError()
          await connection.execute("UPDATE quality_hub_qna_message SET hidden_at = NULL, hidden_by_user_id = NULL, updated_at = CURRENT_TIMESTAMP(3) WHERE message_id = ?", [messageId])
          await connection.execute("UPDATE quality_hub_qna_question SET status = IF(status = 'waiting', 'active', status), updated_at = CURRENT_TIMESTAMP(3) WHERE question_id = ?", [questionId])
          await insertHistory(connection, { questionId, messageId, actionType: "message_restored", actor, uuidFactory })
          return { updated: true }
        }
        if (current.hiddenAt) throw new QnaNotFoundError("답변")
        assertMessageOwner(current, actor)
        const message = messageInput(input)
        await connection.execute("UPDATE quality_hub_qna_message SET body_html = ?, body_text = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE message_id = ?", [message.bodyHtml, message.bodyText, messageId])
        await connection.execute("UPDATE quality_hub_qna_question SET updated_at = CURRENT_TIMESTAMP(3) WHERE question_id = ?", [questionId])
        await insertHistory(connection, { questionId, messageId, actionType: "message_updated", actor, uuidFactory })
        return { updated: true }
      })
    },

    async markNotificationsRead(input, actorInput) {
      const actor = normalizeActor(actorInput)
      if (input?.all === true) {
        const [result] = await pool.execute("UPDATE quality_hub_qna_notification SET read_at = CURRENT_TIMESTAMP(3) WHERE recipient_user_id = ? AND read_at IS NULL", [actor.userId])
        return { updated: Number(result.affectedRows ?? 0) }
      }
      const notificationId = requireText(input?.notificationId, "notificationId", 36)
      const [result] = await pool.execute("UPDATE quality_hub_qna_notification SET read_at = CURRENT_TIMESTAMP(3) WHERE notification_id = ? AND recipient_user_id = ?", [notificationId, actor.userId])
      if (Number(result.affectedRows ?? 0) === 0) throw new QnaNotFoundError("알림")
      return { updated: 1 }
    },

    async close() {
      if (typeof pool.end === "function") await pool.end()
    },
  }
}
