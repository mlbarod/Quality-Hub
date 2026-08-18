-- 이전 Excel 하이브리드 초안 테이블을 이미 적용한 환경에서만 사용하는 수동 전환 스크립트
-- 기존 테이블은 삭제하지 않고 백업 이름으로 보존한다. 신규 환경에서는 이 파일을 실행하지 않는다.
-- 실행 전 quality_hub_change_category_excel_backup 테이블이 없는지 DBA가 확인해야 한다.

RENAME TABLE quality_hub_change_category TO quality_hub_change_category_excel_backup;

CREATE TABLE quality_hub_change_category (
  singleton_id TINYINT UNSIGNED NOT NULL,
  image_name VARCHAR(255) NOT NULL,
  image_type VARCHAR(100) NOT NULL,
  image_size INT UNSIGNED NOT NULL,
  image_width INT UNSIGNED NOT NULL,
  image_height INT UNSIGNED NOT NULL,
  image_blob MEDIUMBLOB NOT NULL,
  updated_by VARCHAR(100) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (singleton_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
