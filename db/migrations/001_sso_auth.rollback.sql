-- 001_sso_auth.sql 전용 철회 스크립트
-- 저장된 세션, 권한 규칙, 마스터와 변경 이력이 모두 삭제된다.
-- 운영 적용 전 반드시 백업 및 DBA 승인을 받는다.

DROP TABLE IF EXISTS quality_hub_auth_session;
DROP TABLE IF EXISTS quality_hub_oidc_transaction;
DROP TABLE IF EXISTS quality_hub_permission_history;
DROP TABLE IF EXISTS quality_hub_access_rule;
DROP TABLE IF EXISTS quality_hub_master_account;
