-- Quality Hub SSO 인증/권한 테이블 신규 생성
-- 운영 DB에서 자동 실행되지 않는다. DBA 검토 후 수동 적용한다.

CREATE TABLE quality_hub_master_account (
  user_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  display_name VARCHAR(100) NULL,
  department VARCHAR(200) NULL,
  created_by VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE quality_hub_access_rule (
  rule_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role_name ENUM('admin', 'general') NOT NULL,
  claim_field ENUM('user_id', 'department') NOT NULL,
  match_type ENUM('exact', 'contains') NOT NULL,
  match_value VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (rule_id),
  UNIQUE KEY uq_quality_hub_access_rule (role_name, claim_field, match_type, match_value),
  INDEX idx_quality_hub_access_rule_active (is_active, role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE quality_hub_permission_history (
  history_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action_type ENUM('create', 'update', 'delete') NOT NULL,
  target_type ENUM('master', 'access_rule') NOT NULL,
  target_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  actor_user_id VARCHAR(100) NOT NULL,
  detail_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (history_id),
  INDEX idx_quality_hub_permission_history_created (created_at),
  INDEX idx_quality_hub_permission_history_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE quality_hub_oidc_transaction (
  state_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  correlation_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nonce_value VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  return_to VARCHAR(2048) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (state_hash),
  UNIQUE KEY uq_quality_hub_oidc_correlation (correlation_hash),
  INDEX idx_quality_hub_oidc_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE quality_hub_auth_session (
  session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  department VARCHAR(200) NOT NULL,
  token_expires_at DATETIME(3) NOT NULL,
  idle_expires_at DATETIME(3) NOT NULL,
  absolute_expires_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at DATETIME(3) NULL,
  PRIMARY KEY (session_hash),
  INDEX idx_quality_hub_auth_session_user (user_id, revoked_at),
  INDEX idx_quality_hub_auth_session_expiry (idle_expires_at, absolute_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
