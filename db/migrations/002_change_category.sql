-- 변승위 Category 최신 자료 1건과 선택적 원본 XLSX 파일 저장 테이블
-- 운영 DB에서 자동 실행되지 않는다. DBA 검토와 백업 확인 후 수동 적용한다.

CREATE TABLE quality_hub_change_category (
  singleton_id TINYINT UNSIGNED NOT NULL,
  sheet_json LONGTEXT NOT NULL,
  sheet_text MEDIUMTEXT NOT NULL,
  source_file_name VARCHAR(255) NULL,
  source_file_type VARCHAR(127) NULL,
  source_file_size INT UNSIGNED NULL,
  source_file_blob MEDIUMBLOB NULL,
  updated_by VARCHAR(100) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (singleton_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
