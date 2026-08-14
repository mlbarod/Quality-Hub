import mysql from "mysql2/promise"
import { randomUUID } from "node:crypto"

import { loadDbConfig } from "./conversationHistoryRepository.mjs"

function requiredText(value, label, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new TypeError(`${label} 값을 확인해 주세요.`)
  }
  return value.trim()
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError("날짜 값이 올바르지 않습니다.")
  return date
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

export function createAuthPool({ config = loadDbConfig(), mysqlImpl = mysql } = {}) {
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

function normalizeRule(row) {
  return {
    ruleId: row.ruleId,
    role: row.role,
    field: row.field,
    matchType: row.matchType,
    matchValue: row.matchValue,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function ruleMatches(rule, identity) {
  const actual = rule.field === "user_id" ? identity.userId : identity.department
  if (typeof actual !== "string") return false
  return rule.matchType === "contains" ? actual.includes(rule.matchValue) : actual === rule.matchValue
}

export function resolveRoleFromRecords(identity, masters, rules) {
  if (masters.some((master) => master.userId === identity.userId)) return "master"
  const roles = rules.filter((rule) => ruleMatches(rule, identity)).map((rule) => rule.role)
  if (roles.includes("admin")) return "admin"
  if (roles.includes("general")) return "general"
  return "blocked"
}

export function createAuthRepository({ pool = createAuthPool(), uuidFactory = randomUUID } = {}) {
  return {
    async bootstrapMasters(userIds) {
      const uniqueIds = [...new Set(userIds.map((value) => requiredText(value, "초기 마스터 사용자 ID", 100).toLowerCase()))]
      if (uniqueIds.length === 0) return { initialized: false, count: 0 }
      return withTransaction(pool, async (connection) => {
        const [countRows] = await connection.execute("SELECT COUNT(*) AS count FROM quality_hub_master_account FOR UPDATE")
        if (Number(countRows[0]?.count ?? 0) > 0) return { initialized: false, count: 0 }
        for (const userId of uniqueIds) {
          await connection.execute(`
            INSERT INTO quality_hub_master_account (user_id, display_name, department, created_by)
            VALUES (?, NULL, NULL, 'bootstrap')
          `, [userId])
          await connection.execute(`
            INSERT INTO quality_hub_permission_history
              (history_id, action_type, target_type, target_id, actor_user_id, detail_json)
            VALUES (?, 'create', 'master', ?, 'bootstrap', JSON_OBJECT('source', 'SSO_BOOTSTRAP_MASTER_USER_IDS'))
          `, [uuidFactory(), userId])
        }
        return { initialized: true, count: uniqueIds.length }
      })
    },

    async createLoginTransaction({ stateHash, correlationHash, nonce, returnTo, expiresAt }) {
      await pool.execute("DELETE FROM quality_hub_oidc_transaction WHERE expires_at <= CURRENT_TIMESTAMP(3)")
      await pool.execute(`
        DELETE FROM quality_hub_auth_session
        WHERE token_expires_at <= CURRENT_TIMESTAMP(3)
           OR idle_expires_at <= CURRENT_TIMESTAMP(3)
           OR absolute_expires_at <= CURRENT_TIMESTAMP(3)
           OR revoked_at <= CURRENT_TIMESTAMP(3) - INTERVAL 7 DAY
      `)
      await pool.execute(`
        INSERT INTO quality_hub_oidc_transaction
          (state_hash, correlation_hash, nonce_value, return_to, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `, [stateHash, correlationHash, requiredText(nonce, "nonce", 128), requiredText(returnTo, "returnTo", 2048), toDate(expiresAt)])
    },

    async consumeLoginTransaction({ stateHash, correlationHash, now = new Date() }) {
      return withTransaction(pool, async (connection) => {
        const [rows] = await connection.execute(`
          SELECT nonce_value AS nonce, return_to AS returnTo
          FROM quality_hub_oidc_transaction
          WHERE state_hash = ? AND correlation_hash = ? AND expires_at > ?
          FOR UPDATE
        `, [stateHash, correlationHash, toDate(now)])
        if (rows.length !== 1) return null
        await connection.execute("DELETE FROM quality_hub_oidc_transaction WHERE state_hash = ?", [stateHash])
        return rows[0]
      })
    },

    async createSession({ sessionHash, identity, expiresAt, idleExpiresAt, absoluteExpiresAt }) {
      await pool.execute(`
        INSERT INTO quality_hub_auth_session
          (session_hash, user_id, display_name, department, token_expires_at, idle_expires_at, absolute_expires_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
      `, [
        sessionHash,
        requiredText(identity.userId, "사용자 ID", 100).toLowerCase(),
        requiredText(identity.displayName, "표시 이름", 100),
        requiredText(identity.department, "소속부서", 200),
        toDate(expiresAt),
        toDate(idleExpiresAt),
        toDate(absoluteExpiresAt),
      ])
    },

    async findSession(sessionHash, { now = new Date(), idleSeconds = 1800 } = {}) {
      const [rows] = await pool.execute(`
        SELECT
          user_id AS userId,
          display_name AS displayName,
          department,
          token_expires_at AS tokenExpiresAt,
          absolute_expires_at AS absoluteExpiresAt
        FROM quality_hub_auth_session
        WHERE session_hash = ?
          AND revoked_at IS NULL
          AND token_expires_at > ?
          AND idle_expires_at > ?
          AND absolute_expires_at > ?
        LIMIT 1
      `, [sessionHash, toDate(now), toDate(now), toDate(now)])
      if (rows.length !== 1) return null
      const maximumExpiry = Math.min(new Date(rows[0].tokenExpiresAt).getTime(), new Date(rows[0].absoluteExpiresAt).getTime())
      const nextIdleExpiry = new Date(Math.min(now.getTime() + idleSeconds * 1000, maximumExpiry))
      await pool.execute(`
        UPDATE quality_hub_auth_session
        SET last_seen_at = ?, idle_expires_at = ?
        WHERE session_hash = ? AND revoked_at IS NULL
      `, [toDate(now), nextIdleExpiry, sessionHash])
      return {
        userId: rows[0].userId,
        displayName: rows[0].displayName,
        department: rows[0].department,
        expiresAt: new Date(maximumExpiry),
      }
    },

    async revokeSession(sessionHash) {
      await pool.execute(`
        UPDATE quality_hub_auth_session SET revoked_at = CURRENT_TIMESTAMP(3)
        WHERE session_hash = ? AND revoked_at IS NULL
      `, [sessionHash])
    },

    async revokeUserSessions(userId) {
      await pool.execute(`
        UPDATE quality_hub_auth_session SET revoked_at = CURRENT_TIMESTAMP(3)
        WHERE user_id = ? AND revoked_at IS NULL
      `, [requiredText(userId, "사용자 ID", 100).toLowerCase()])
    },

    async resolveRole(identity) {
      const [masters] = await pool.execute(`
        SELECT user_id AS userId FROM quality_hub_master_account
        WHERE user_id = ?
      `, [requiredText(identity.userId, "사용자 ID", 100)])
      if (masters.length > 0) return "master"
      const [rows] = await pool.execute(`
        SELECT
          rule_id AS ruleId,
          role_name AS role,
          claim_field AS field,
          match_type AS matchType,
          match_value AS matchValue,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM quality_hub_access_rule
        WHERE is_active = 1
      `)
      return resolveRoleFromRecords(identity, [], rows.map(normalizeRule))
    },

    async listMasters() {
      const [rows] = await pool.execute(`
        SELECT user_id AS userId, display_name AS displayName, department, created_at AS createdAt
        FROM quality_hub_master_account ORDER BY created_at, user_id
      `)
      return rows
    },

    async addMaster({ userId, displayName = null, department = null, actorUserId }) {
      const normalizedUserId = requiredText(userId, "사용자 ID", 100).toLowerCase()
      await withTransaction(pool, async (connection) => {
        await connection.execute(`
          INSERT INTO quality_hub_master_account (user_id, display_name, department, created_by)
          VALUES (?, ?, ?, ?)
        `, [normalizedUserId, displayName?.trim() || null, department?.trim() || null, actorUserId])
        await connection.execute(`
          INSERT INTO quality_hub_permission_history
            (history_id, action_type, target_type, target_id, actor_user_id, detail_json)
          VALUES (?, 'create', 'master', ?, ?, NULL)
        `, [uuidFactory(), normalizedUserId, actorUserId])
      })
      return { userId: normalizedUserId, displayName: displayName?.trim() || null, department: department?.trim() || null }
    },

    async removeMaster({ userId, actorUserId }) {
      const normalizedUserId = requiredText(userId, "사용자 ID", 100).toLowerCase()
      await withTransaction(pool, async (connection) => {
        const [countRows] = await connection.execute("SELECT COUNT(*) AS count FROM quality_hub_master_account FOR UPDATE")
        if (Number(countRows[0]?.count ?? 0) <= 1) throw new TypeError("마지막 마스터 권한은 회수할 수 없습니다.")
        const [result] = await connection.execute("DELETE FROM quality_hub_master_account WHERE user_id = ?", [normalizedUserId])
        if (result.affectedRows !== 1) throw new TypeError("마스터 계정을 찾을 수 없습니다.")
        await connection.execute(`
          INSERT INTO quality_hub_permission_history
            (history_id, action_type, target_type, target_id, actor_user_id, detail_json)
          VALUES (?, 'delete', 'master', ?, ?, NULL)
        `, [uuidFactory(), normalizedUserId, actorUserId])
        await connection.execute(`
          UPDATE quality_hub_auth_session SET revoked_at = CURRENT_TIMESTAMP(3)
          WHERE user_id = ? AND revoked_at IS NULL
        `, [normalizedUserId])
      })
    },

    async listRules() {
      const [rows] = await pool.execute(`
        SELECT
          rule_id AS ruleId, role_name AS role, claim_field AS field,
          match_type AS matchType, match_value AS matchValue,
          created_at AS createdAt, updated_at AS updatedAt
        FROM quality_hub_access_rule WHERE is_active = 1
        ORDER BY created_at DESC, rule_id
      `)
      return rows.map(normalizeRule)
    },

    async listPermissionHistory(limit = 100) {
      const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 100
      const [rows] = await pool.execute(`
        SELECT
          history_id AS historyId,
          action_type AS actionType,
          target_type AS targetType,
          target_id AS targetId,
          actor_user_id AS actorUserId,
          detail_json AS detail,
          created_at AS createdAt
        FROM quality_hub_permission_history
        ORDER BY created_at DESC, history_id DESC
        LIMIT ?
      `, [safeLimit])
      return rows
    },

    async createRule({ role, field, matchType, matchValue, actorUserId }) {
      const rule = validateRule({ ruleId: uuidFactory(), role, field, matchType, matchValue })
      await withTransaction(pool, async (connection) => {
        await connection.execute(`
          INSERT INTO quality_hub_access_rule
            (rule_id, role_name, claim_field, match_type, match_value, created_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [rule.ruleId, rule.role, rule.field, rule.matchType, rule.matchValue, actorUserId])
        await connection.execute(`
          INSERT INTO quality_hub_permission_history
            (history_id, action_type, target_type, target_id, actor_user_id, detail_json)
          VALUES (?, 'create', 'access_rule', ?, ?, JSON_OBJECT('role', ?, 'field', ?, 'matchType', ?, 'matchValue', ?))
        `, [uuidFactory(), rule.ruleId, actorUserId, rule.role, rule.field, rule.matchType, rule.matchValue])
      })
      return rule
    },

    async updateRule(ruleId, { role, field, matchType, matchValue, actorUserId }) {
      const rule = validateRule({ ruleId: requiredText(ruleId, "규칙 ID", 36), role, field, matchType, matchValue })
      await withTransaction(pool, async (connection) => {
        const [result] = await connection.execute(`
          UPDATE quality_hub_access_rule
          SET role_name = ?, claim_field = ?, match_type = ?, match_value = ?, updated_at = CURRENT_TIMESTAMP(3)
          WHERE rule_id = ? AND is_active = 1
        `, [rule.role, rule.field, rule.matchType, rule.matchValue, rule.ruleId])
        if (result.affectedRows !== 1) throw new TypeError("접근 권한 규칙을 찾을 수 없습니다.")
        await connection.execute(`
          INSERT INTO quality_hub_permission_history
            (history_id, action_type, target_type, target_id, actor_user_id, detail_json)
          VALUES (?, 'update', 'access_rule', ?, ?, JSON_OBJECT('role', ?, 'field', ?, 'matchType', ?, 'matchValue', ?))
        `, [uuidFactory(), rule.ruleId, actorUserId, rule.role, rule.field, rule.matchType, rule.matchValue])
      })
      return rule
    },

    async deleteRule(ruleId, actorUserId) {
      const normalizedRuleId = requiredText(ruleId, "규칙 ID", 36)
      await withTransaction(pool, async (connection) => {
        const [result] = await connection.execute(`
          DELETE FROM quality_hub_access_rule WHERE rule_id = ? AND is_active = 1
        `, [normalizedRuleId])
        if (result.affectedRows !== 1) throw new TypeError("접근 권한 규칙을 찾을 수 없습니다.")
        await connection.execute(`
          INSERT INTO quality_hub_permission_history
            (history_id, action_type, target_type, target_id, actor_user_id, detail_json)
          VALUES (?, 'delete', 'access_rule', ?, ?, NULL)
        `, [uuidFactory(), normalizedRuleId, actorUserId])
      })
    },

    async close() {
      await pool.end()
    },
  }
}

function validateRule({ ruleId, role, field, matchType, matchValue }) {
  if (role !== "admin" && role !== "general") throw new TypeError("부여 권한을 확인해 주세요.")
  if (field !== "user_id" && field !== "department") throw new TypeError("기준 항목을 확인해 주세요.")
  if (matchType !== "exact" && matchType !== "contains") throw new TypeError("적용 방식을 확인해 주세요.")
  if (field === "user_id" && matchType !== "exact") throw new TypeError("사용자 ID는 정확히 일치 방식만 사용할 수 있습니다.")
  return {
    ruleId,
    role,
    field,
    matchType,
    matchValue: field === "user_id"
      ? requiredText(matchValue, "조건 값", 200).toLowerCase()
      : requiredText(matchValue, "조건 값", 200),
  }
}
