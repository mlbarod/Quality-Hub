-- 클릭 이력을 품질VOE와 동일한 한국시간 DATETIME 저장 방식으로 전환한다.
-- 적용 순서: 클릭 수집 중단 → 사용자가 기존 클릭 이력 삭제 → 아래 DDL → 새 서버 코드 배포·재시작.
-- 대상 DB를 선택한 뒤 수동 실행한다. 애플리케이션은 DDL을 자동 실행하지 않는다.
-- 기존 행의 삭제·시각 보정은 이 스크립트에서 수행하지 않는다.
ALTER TABLE clicked_history
  MODIFY COLUMN update_date DATETIME NOT NULL;
