import { randomUUID } from "node:crypto"

import mysql from "mysql2/promise"

const REQUIRED_DB_CONFIG = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]
const DEFAULT_DB_PORT = 3306

export class ConversationAccessError extends Error {
  constructor(conversationId) {
    super("대화를 찾을 수 없거나 접근 권한이 없습니다.")
    this.name = "ConversationAccessError"
    this.conversationId = conversationId
  }
}

export class MessageAccessError extends Error {
  constructor(messageId) {
    super("메시지를 찾을 수 없거나 접근 권한이 없습니다.")
    this.name = "MessageAccessError"
    this.messageId = messageId
  }
}

function requireText(value, fieldName, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldName} 값을 입력해 주세요.`)
  }
  if (value.length > maxLength) {
    throw new TypeError(`${fieldName} 값은 ${maxLength}자 이하여야 합니다.`)
  }
  return value
}

function optionalText(value, fieldName, maxLength) {
  if (value === undefined || value === null) return null
  return requireText(value, fieldName, maxLength)
}

function parsePort(value) {
  if (value === undefined || value === "") return DEFAULT_DB_PORT
  if (!/^\d+$/.test(value)) throw new TypeError("DB_PORT는 1~65535 범위의 정수여야 합니다.")
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("DB_PORT는 1~65535 범위의 정수여야 합니다.")
  }
  return port
}

function parseMessageLimit(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new TypeError("limit은 1~100 범위의 정수여야 합니다.")
  }
  return value
}

function serializeRagSources(value) {
  if (value === undefined || value === null) return null
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

function validateMessage({ role, content, modelName, ragUsed = false, ragSources = null, status = "completed" }) {
  if (role !== "user" && role !== "assistant") {
    throw new TypeError("role은 user 또는 assistant여야 합니다.")
  }
  if (typeof content !== "string" || content.length === 0) {
    throw new TypeError("content 값을 입력해 주세요.")
  }
  if (typeof ragUsed !== "boolean") {
    throw new TypeError("ragUsed는 boolean 값이어야 합니다.")
  }

  return {
    role,
    content,
    modelName: optionalText(modelName, "modelName", 100),
    ragUsed,
    ragSources: serializeRagSources(ragSources),
    status: requireText(status, "status", 20),
  }
}

export function loadDbConfig(environment = process.env) {
  const missing = REQUIRED_DB_CONFIG.filter((name) => typeof environment[name] !== "string" || environment[name].length === 0)
  if (missing.length > 0) {
    throw new Error(`DB 환경변수가 필요합니다: ${missing.join(", ")}`)
  }

  return {
    host: environment.DB_HOST,
    port: parsePort(environment.DB_PORT),
    user: environment.DB_USER,
    password: environment.DB_PASSWORD,
    database: environment.DB_NAME,
  }
}

export function createConversationPool({
  config = loadDbConfig(),
  mysqlImpl = mysql,
} = {}) {
  return mysqlImpl.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  })
}

async function findOwnedConversation(executor, conversationId, userId, { forUpdate = false } = {}) {
  const [rows] = await executor.execute(`
    SELECT
      conversation_id AS conversationId,
      user_id AS userId,
      title,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM llm_conversation
    WHERE conversation_id = ? AND user_id = ?
    ${forUpdate ? "FOR UPDATE" : ""}
  `, [conversationId, userId])

  if (rows.length === 0) throw new ConversationAccessError(conversationId)
  return rows[0]
}

async function withTransaction(pool, operation) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await operation(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export function createConversationHistoryRepository({
  pool = createConversationPool(),
  uuidFactory = randomUUID,
} = {}) {
  return {
    async createConversation({ userId, title }) {
      const normalizedUserId = requireText(userId, "userId", 100)
      const normalizedTitle = requireText(title, "title", 500)
      const conversationId = uuidFactory()

      await pool.execute(`
        INSERT INTO llm_conversation (
          conversation_id, user_id, title, created_at, updated_at
        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
      `, [conversationId, normalizedUserId, normalizedTitle])

      return findOwnedConversation(pool, conversationId, normalizedUserId)
    },

    async listConversations(userId) {
      const normalizedUserId = requireText(userId, "userId", 100)
      const [rows] = await pool.execute(`
        SELECT
          conversation_id AS conversationId,
          user_id AS userId,
          title,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM llm_conversation
        WHERE user_id = ?
        ORDER BY updated_at DESC, conversation_id DESC
      `, [normalizedUserId])
      return rows
    },

    async assertConversationOwnership({ conversationId, userId }) {
      return findOwnedConversation(
        pool,
        requireText(conversationId, "conversationId", 36),
        requireText(userId, "userId", 100),
      )
    },

    async listMessages({ conversationId, userId }) {
      const normalizedConversationId = requireText(conversationId, "conversationId", 36)
      const normalizedUserId = requireText(userId, "userId", 100)
      await findOwnedConversation(pool, normalizedConversationId, normalizedUserId)

      const [rows] = await pool.execute(`
        SELECT
          message_id AS messageId,
          conversation_id AS conversationId,
          role,
          content,
          model_name AS modelName,
          rag_used AS ragUsed,
          rag_sources AS ragSources,
          status,
          created_at AS createdAt
        FROM llm_message
        WHERE conversation_id = ?
        ORDER BY created_at ASC, message_id ASC
      `, [normalizedConversationId])
      return rows
    },

    async listRecentMessages({ conversationId, userId, limit = 10 }) {
      const normalizedConversationId = requireText(conversationId, "conversationId", 36)
      const normalizedUserId = requireText(userId, "userId", 100)
      const normalizedLimit = parseMessageLimit(limit)
      await findOwnedConversation(pool, normalizedConversationId, normalizedUserId)

      const [rows] = await pool.execute(`
        SELECT
          message_id AS messageId,
          conversation_id AS conversationId,
          role,
          content,
          model_name AS modelName,
          rag_used AS ragUsed,
          rag_sources AS ragSources,
          status,
          created_at AS createdAt
        FROM llm_message
        WHERE conversation_id = ? AND status = ?
        ORDER BY created_at DESC, message_id DESC
        LIMIT ${normalizedLimit}
      `, [normalizedConversationId, "completed"])
      return rows.reverse()
    },

    async saveMessage({ conversationId, userId, ...message }) {
      const normalizedConversationId = requireText(conversationId, "conversationId", 36)
      const normalizedUserId = requireText(userId, "userId", 100)
      const normalizedMessage = validateMessage(message)
      const messageId = uuidFactory()

      return withTransaction(pool, async (connection) => {
        await findOwnedConversation(connection, normalizedConversationId, normalizedUserId, { forUpdate: true })
        await connection.execute(`
          INSERT INTO llm_message (
            message_id,
            conversation_id,
            role,
            content,
            model_name,
            rag_used,
            rag_sources,
            status,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
        `, [
          messageId,
          normalizedConversationId,
          normalizedMessage.role,
          normalizedMessage.content,
          normalizedMessage.modelName,
          normalizedMessage.ragUsed ? 1 : 0,
          normalizedMessage.ragSources,
          normalizedMessage.status,
        ])
        await connection.execute(`
          UPDATE llm_conversation
          SET updated_at = CURRENT_TIMESTAMP(6)
          WHERE conversation_id = ? AND user_id = ?
        `, [normalizedConversationId, normalizedUserId])

        const [rows] = await connection.execute(`
          SELECT
            message_id AS messageId,
            conversation_id AS conversationId,
            role,
            content,
            model_name AS modelName,
            rag_used AS ragUsed,
            rag_sources AS ragSources,
            status,
            created_at AS createdAt
          FROM llm_message
          WHERE message_id = ?
        `, [messageId])
        return rows[0]
      })
    },

    async updateMessageStatus({ messageId, conversationId, userId, status }) {
      const normalizedMessageId = requireText(messageId, "messageId", 36)
      const normalizedConversationId = requireText(conversationId, "conversationId", 36)
      const normalizedUserId = requireText(userId, "userId", 100)
      const normalizedStatus = requireText(status, "status", 20)

      return withTransaction(pool, async (connection) => {
        await findOwnedConversation(connection, normalizedConversationId, normalizedUserId, { forUpdate: true })
        const [result] = await connection.execute(`
          UPDATE llm_message
          SET status = ?
          WHERE message_id = ? AND conversation_id = ?
        `, [normalizedStatus, normalizedMessageId, normalizedConversationId])
        if (result.affectedRows === 0) throw new MessageAccessError(normalizedMessageId)

        await connection.execute(`
          UPDATE llm_conversation
          SET updated_at = CURRENT_TIMESTAMP(6)
          WHERE conversation_id = ? AND user_id = ?
        `, [normalizedConversationId, normalizedUserId])

        const [rows] = await connection.execute(`
          SELECT
            message_id AS messageId,
            conversation_id AS conversationId,
            role,
            content,
            model_name AS modelName,
            rag_used AS ragUsed,
            rag_sources AS ragSources,
            status,
            created_at AS createdAt
          FROM llm_message
          WHERE message_id = ? AND conversation_id = ?
        `, [normalizedMessageId, normalizedConversationId])
        return rows[0]
      })
    },

    async deleteConversation({ conversationId, userId }) {
      const normalizedConversationId = requireText(conversationId, "conversationId", 36)
      const normalizedUserId = requireText(userId, "userId", 100)

      return withTransaction(pool, async (connection) => {
        await findOwnedConversation(connection, normalizedConversationId, normalizedUserId, { forUpdate: true })
        await connection.execute(
          "DELETE FROM llm_message WHERE conversation_id = ?",
          [normalizedConversationId],
        )
        await connection.execute(
          "DELETE FROM llm_conversation WHERE conversation_id = ? AND user_id = ?",
          [normalizedConversationId, normalizedUserId],
        )
        return { conversationId: normalizedConversationId, deleted: true }
      })
    },

    async close() {
      await pool.end()
    },
  }
}
