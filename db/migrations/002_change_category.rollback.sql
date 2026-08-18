-- 002_change_category.sql 전용 철회 스크립트
-- 저장된 Category 표와 원본 XLSX 파일이 모두 삭제된다. 운영 적용 전 반드시 백업한다.

DROP TABLE IF EXISTS quality_hub_change_category;
