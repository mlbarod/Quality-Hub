-- Excel 초안 테이블 전환 전용 철회 스크립트
-- 현재 이미지 테이블의 데이터가 삭제된다. 백업과 DBA 승인 후에만 수동 실행한다.

DROP TABLE quality_hub_change_category;
RENAME TABLE quality_hub_change_category_excel_backup TO quality_hub_change_category;
