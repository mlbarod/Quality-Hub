# Q&A 데이터베이스 구조 설계

## 문서 상태와 적용 범위

이 문서는 Quality Hub Q&A 게시판의 실제 DB 연결과 기존 운영 데이터 이관에 필요한 최소 테이블 구조를 정의한다. 실제 운영 DB에는 자동 적용하지 않는다.

기존 데이터는 기존 DB에서 직접 복사하지 않는다. 사용자가 기존 데이터를 Excel로 추출하고, Python과 pandas로 정리한 뒤 매개변수화된 SQL로 신규 테이블에 적재한다. 이 결정에 따라 DB 내부의 이관용 매핑·배치·스테이징 테이블은 생성하지 않는다.

현재 DB 제품과 버전, 기존 Q&A 테이블 구조, 문자셋과 Collation은 아직 확인하지 않았다. 아래 자료형과 제약은 MySQL/MariaDB 공통 방향의 설계안이며, 실제 `CREATE TABLE` 문은 `SELECT VERSION()`, 운영 DB 기준과 DBA 검토 후 확정한다.

## 생성 대상과 제외 대상

### 생성할 테이블

1. `quality_hub_qna_question`: 질문
2. `quality_hub_qna_message`: 답변·추가 댓글
3. `quality_hub_qna_question_tag`: 질문 태그
4. `quality_hub_qna_notification`: 사용자별 알림
5. `quality_hub_qna_history`: 변경 이력

### 생성하지 않을 테이블

- `quality_hub_qna_import_map`: Excel과 Python 메모리의 키 매핑으로 대체
- 이관 배치·스테이징 테이블: DataFrame 검증 결과와 로컬 이관 보고서로 대체
- 첨부파일 테이블: 실제 파일 저장소와 운영 정책이 정해질 때까지 보류

과거 알림과 변경 이력은 이관하지 않는다. 알림과 변경 이력 테이블은 실제 웹서비스 전환 이후 발생하는 신규 활동부터 사용한다.

## 본문 평문과 태그의 차이

`body_html`, `body_text`, 태그는 서로 다른 데이터다.

| 데이터 | 예시 | 생성 방식과 용도 |
| --- | --- | --- |
| `body_html` | `<p><strong>식각 Rate</strong> 기준을 문의합니다.</p>` | 사용자가 작성한 리치 텍스트를 서버가 정제해 저장하고 화면 표시·수정에 사용 |
| `body_text` | `식각 Rate 기준을 문의합니다.` | 서버가 정제된 HTML에서 자동 추출하며 검색·목록 요약에 사용 |
| 태그 | `식각`, `Rate`, `적용시점` | 사용자가 질문 작성 화면에서 별도로 입력하는 최대 5개 분류어 |

사용자는 `body_text`를 직접 입력하지 않는다. 질문이나 답변을 저장·수정할 때 서버가 `body_html`을 정제한 뒤 평문을 다시 생성해 두 컬럼을 함께 저장한다. 목록의 요약 문구는 별도 컬럼을 두지 않고 `body_text` 앞부분으로 API에서 생성한다.

Excel 이관 데이터가 평문이면 Python 코드가 원문을 `body_text`에 저장하고, HTML 특수문자를 이스케이프한 뒤 문단과 줄바꿈만 변환해 `body_html`을 만든다.

태그는 Q&A 게시판 내부 검색에는 포함되지만 현재 통합 검색 대상은 아니다. 현재 통합 검색 범위는 질문 제목, 질문 본문과 숨김 처리되지 않은 답변·댓글 내용이다.

## 관계 구조

```text
quality_hub_qna_question 1 ─── N quality_hub_qna_message
            │
            ├── N quality_hub_qna_question_tag
            ├── N quality_hub_qna_notification
            └── N quality_hub_qna_history
```

질문과 답변·댓글은 중첩 대댓글 없이 평면 대화로 저장한다. 모든 답변·댓글은 `question_id`로 질문에 연결한다.

## 1. `quality_hub_qna_question`

질문 본문, 분류, 처리 상태와 최종 답변을 관리한다.

| 컬럼 | 제안 자료형 | NULL | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `question_id` | `BIGINT UNSIGNED AUTO_INCREMENT` | 불가 | 자동 발급 | 내부 PK |
| `title` | `VARCHAR(255)` | 불가 | 없음 | 질문 제목 |
| `body_html` | `MEDIUMTEXT` | 불가 | 없음 | 서버가 정제한 리치 텍스트 본문 |
| `body_text` | `MEDIUMTEXT` | 불가 | 없음 | 검색·요약용 평문 본문 |
| `category` | `VARCHAR(30)` | 불가 | 없음 | `Rule`, `SPC`, `FDC`, `TTTM`, `Report`, `WF Loss`; 이관 데이터는 `미분류` 허용 |
| `line_name` | `VARCHAR(100)` | 불가 | 없음 | 질문 라인 이름; 이관 데이터는 `미지정` 허용 |
| `status` | `VARCHAR(20)` | 불가 | `waiting` | `waiting`, `active`, `completed` |
| `author_user_id` | `VARCHAR(100)` | 불가 | 없음 | 권한 판정용 SSO 사용자 ID |
| `author_display_name` | `VARCHAR(100)` | 불가 | 없음 | 작성자 화면 표시 이름 |
| `final_message_id` | `BIGINT UNSIGNED` | 가능 | `NULL` | 최종 답변으로 지정한 메시지 ID |
| `view_count` | `INT UNSIGNED` | 불가 | `0` | 조회 수 |
| `created_at` | `DATETIME(3)` | 불가 | `CURRENT_TIMESTAMP(3)` | 등록 시각 |
| `updated_at` | `DATETIME(3)` | 불가 | `CURRENT_TIMESTAMP(3)` | 최근 변경 시각 |
| `hidden_at` | `DATETIME(3)` | 가능 | `NULL` | 복구 가능한 숨김 처리 시각 |
| `hidden_by_user_id` | `VARCHAR(100)` | 가능 | `NULL` | 숨김 처리 사용자 ID |

권장 키와 인덱스:

- PK: `question_id`
- 목록: `(hidden_at, created_at, question_id)`
- 필터: `(hidden_at, status, category, line_name, created_at)`
- 작성자 권한 조회: `(author_user_id, hidden_at)`
- `final_message_id`는 메시지 테이블 생성 후 FK를 추가한다.

화면 표시용 질문 번호는 `question_id`와 등록 연도를 이용해 API에서 `Q-연도-번호` 형식으로 만든다. 외부 시스템이 이 표시 번호를 영구 참조해야 한다는 요구가 생기기 전에는 별도 `question_code` 컬럼을 만들지 않는다.

## 2. `quality_hub_qna_message`

질문에 작성된 답변과 추가 댓글을 행 단위로 저장한다. 작성 당시 역할은 권한 판정에 사용할 수 없고 현재 요구사항에도 필수 표시값이 아니므로 별도 역할 스냅샷 컬럼을 두지 않는다.

| 컬럼 | 제안 자료형 | NULL | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `message_id` | `BIGINT UNSIGNED AUTO_INCREMENT` | 불가 | 자동 발급 | 내부 PK |
| `question_id` | `BIGINT UNSIGNED` | 불가 | 없음 | 소속 질문 FK |
| `body_html` | `MEDIUMTEXT` | 불가 | 없음 | 서버가 정제한 답변·댓글 리치 텍스트 |
| `body_text` | `MEDIUMTEXT` | 불가 | 없음 | 통합 검색용 평문 답변·댓글 |
| `author_user_id` | `VARCHAR(100)` | 불가 | 없음 | 권한 판정용 SSO 사용자 ID |
| `author_display_name` | `VARCHAR(100)` | 불가 | 없음 | 작성자 화면 표시 이름 |
| `created_at` | `DATETIME(3)` | 불가 | `CURRENT_TIMESTAMP(3)` | 등록 시각 |
| `updated_at` | `DATETIME(3)` | 불가 | `CURRENT_TIMESTAMP(3)` | 수정 시각 |
| `hidden_at` | `DATETIME(3)` | 가능 | `NULL` | 숨김 처리 시각 |
| `hidden_by_user_id` | `VARCHAR(100)` | 가능 | `NULL` | 숨김 처리 사용자 ID |

권장 키와 인덱스:

- PK: `message_id`
- FK: `question_id` → `quality_hub_qna_question.question_id`
- 대화 조회: `(question_id, hidden_at, created_at, message_id)`
- 작성자 권한 조회: `(author_user_id, hidden_at)`

최종 답변 지정 시 서버는 `message_id`가 같은 `question_id`에 속하고 숨김 상태가 아닌지 확인한다. 검증 후 `quality_hub_qna_question.final_message_id`와 `status='completed'`를 한 트랜잭션에서 갱신한다.

## 3. `quality_hub_qna_question_tag`

질문 작성 화면에서 입력한 최대 5개의 태그를 저장한다. 중요도와 순서는 사용하지 않는다.

| 컬럼 | 제안 자료형 | NULL | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `question_id` | `BIGINT UNSIGNED` | 불가 | 없음 | 질문 FK |
| `tag_name` | `VARCHAR(50)` | 불가 | 없음 | 표시·검색용 태그 |

권장 키와 인덱스:

- PK: `(question_id, tag_name)`
- FK: `question_id` → `quality_hub_qna_question.question_id`
- 태그 검색: `(tag_name, question_id)`

서버는 앞뒤 공백과 선행 `#`을 제거하고 유니코드 NFKC 정규화를 적용한다. 대소문자를 무시해 중복을 판정하되 처음 입력한 표시 형태는 보존한다. 질문 하나당 태그 5개, 태그 하나당 50자 제한을 적용한다.

## 4. `quality_hub_qna_notification`

사용자별 Q&A 알림과 읽음 상태를 저장한다. 알림 문구는 `event_type`과 질문 제목을 이용해 API에서 생성하므로 제목·상세 문구를 중복 저장하지 않는다.

| 컬럼 | 제안 자료형 | NULL | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `notification_id` | `CHAR(36)` | 불가 | 서버 UUID | PK |
| `recipient_user_id` | `VARCHAR(100)` | 불가 | 없음 | 알림 수신 사용자 ID |
| `question_id` | `BIGINT UNSIGNED` | 불가 | 없음 | 관련 질문 FK |
| `event_type` | `VARCHAR(30)` | 불가 | 없음 | `reply_created`, `status_changed`, `final_selected` 등 |
| `read_at` | `DATETIME(3)` | 가능 | `NULL` | 읽음 시각 |
| `created_at` | `DATETIME(3)` | 불가 | `CURRENT_TIMESTAMP(3)` | 생성 시각 |

권장 인덱스:

- PK: `notification_id`
- 알림 목록: `(recipient_user_id, read_at, created_at)`
- 질문별 알림: `(question_id, created_at)`

## 5. `quality_hub_qna_history`

질문·답변·상태·최종 답변·숨김·복구 변경을 추가 전용으로 기록한다. 마스터만 조회할 수 있다.

| 컬럼 | 제안 자료형 | NULL | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `history_id` | `CHAR(36)` | 불가 | 서버 UUID | PK |
| `question_id` | `BIGINT UNSIGNED` | 불가 | 없음 | 관련 질문 ID |
| `message_id` | `BIGINT UNSIGNED` | 가능 | `NULL` | 관련 답변·댓글 ID |
| `action_type` | `VARCHAR(30)` | 불가 | 없음 | 등록·수정·숨김·복구·상태 변경 등 |
| `actor_user_id` | `VARCHAR(100)` | 불가 | 없음 | 작업 사용자 ID |
| `actor_display_name` | `VARCHAR(100)` | 불가 | 없음 | 작업자 화면 표시 이름 |
| `detail_json` | `JSON` | 가능 | `NULL` | 내용 원문을 제외한 상태·필드 등 안전한 변경 정보 |
| `created_at` | `DATETIME(3)` | 불가 | `CURRENT_TIMESTAMP(3)` | 작업 시각 |

권장 인덱스:

- PK: `history_id`
- 질문 이력: `(question_id, created_at)`
- 전체 최신 이력: `(created_at)`
- 작업자 이력: `(actor_user_id, created_at)`

`detail_json`의 실제 자료형은 DB 버전을 확인한 뒤 `JSON` 또는 JSON 문자열을 저장하는 `LONGTEXT`로 확정한다. 질문·답변 내용, 개인정보와 인증 정보는 이력 로그에 복제하지 않는다.

## 검색과 요약 규칙

### Q&A 게시판 내부 검색

다음 값을 검색 대상으로 사용한다.

- 질문 제목
- 질문 `body_text`
- 작성자 표시 이름
- 구분과 라인
- `quality_hub_qna_question_tag`의 태그

### 통합 검색

현재 요구사항에 따라 다음 값만 대상으로 한다.

- 질문 제목
- 질문 `body_text`
- 숨김 처리되지 않은 `quality_hub_qna_message.body_text`

공백으로 구분한 모든 검색어가 질문 제목·본문·답변을 합친 검색 문서 안에 존재해야 결과에 포함한다. 태그, 작성자, 구분과 라인은 통합 검색 대상이 아니다.

목록 요약은 질문 `body_text`를 공백 정규화한 뒤 정해진 길이로 잘라 API에서 생성한다. DB에 별도 요약 컬럼을 저장하지 않는다.

## Excel·pandas 이관 규칙

### DataFrame 필수 작업 컬럼

다음 값은 DB 컬럼이 아니라 Python 처리 중에만 사용한다.

| 작업 컬럼 | 용도 |
| --- | --- |
| `legacy_question_key` | 기존 질문과 답변을 묶는 안정적인 키 |
| `legacy_answer_key` | 답변 중복 확인용 키; 없으면 행 번호와 질문 키로 생성 |
| `migration_error` | 필수값 누락·관계 불명확 등 이관 제외 사유 |

### 적재 순서

1. Excel 원본을 변경하지 않고 별도 정제 DataFrame을 만든다.
2. 질문을 `legacy_question_key`로 중복 제거한다.
3. 질문을 매개변수화된 INSERT로 등록하고 반환된 `question_id`를 Python 딕셔너리에 저장한다.
4. `legacy_question_key → question_id` 딕셔너리로 답변의 FK를 만든다.
5. 답변과 신뢰 가능한 태그를 배치 INSERT한다.
6. 질문·답변 건수, 고아 답변, 중복과 검색용 평문을 검증한 뒤 커밋한다.

`pandas.DataFrame.to_sql(..., if_exists='append')`만으로 질문과 답변을 각각 밀어 넣으면 신규 `question_id` 대응 관계를 안정적으로 얻기 어렵다. 질문 INSERT의 `lastrowid`를 매핑하거나, 서비스 공개 전 비어 있는 신규 테이블에 Python이 충돌 없는 PK를 명시적으로 부여하는 방식 중 하나를 사용한다. 기본안은 DB가 ID를 발급하고 Python이 `lastrowid`를 저장하는 방식이다.

기본 이관 스크립트는 한 트랜잭션에서 실행하고, 오류가 나면 전체 롤백한다. 실행 전 질문·메시지 대상 테이블이 비어 있는지 확인하며, 이미 데이터가 있으면 자동 중단한다. 데이터가 한 트랜잭션으로 처리하기 어려울 만큼 많을 때만 로컬 체크포인트를 둔 고정 크기 배치 방식으로 전환한다. 원본 Excel과 다음 이관 보고서는 DB 밖에 보존한다.

- 원본 질문·답변 수
- 이관 질문·답변·태그 수
- 중복 제외 수
- 관계 불명확·필수값 누락 수와 사유
- 질문·답변 샘플 검색 결과
- 실행 시각과 대상 DB 식별 정보

SQL 문자열에 Excel 값을 직접 연결하지 않고 반드시 파라미터 바인딩을 사용한다. 로그에는 질문·답변 원문이나 개인정보를 출력하지 않는다.

### 기존 데이터 기본값

| 대상 | 이관 규칙 |
| --- | --- |
| 제목 | 기존 제목을 사용하고, 없으면 질문 본문의 첫 문장 또는 앞부분으로 생성 |
| 질문·답변 HTML | 평문을 HTML 이스케이프한 뒤 문단·줄바꿈만 변환 |
| `body_text` | 기존 원문에서 공백과 줄바꿈을 정규화하되 검색에 필요한 텍스트는 보존 |
| 구분 | 정확한 매핑이 없으면 `미분류` |
| 라인 | 정확한 매핑이 없으면 `미지정` |
| 상태 | 답변 없음 `waiting`, 답변 있음 `active`, 명확한 완료 근거가 있을 때만 `completed` |
| 최종 답변 | 명확한 기존 표시가 없으면 `NULL` |
| 작성자 ID | 사번·SSO ID가 확실할 때만 연결하고, 아니면 이관 전용 사용자 ID 사용 |
| 작성자 이름 | 기존 표시 이름을 `author_display_name`에 보존 |
| 태그 | 신뢰할 수 있는 기존 태그가 있을 때만 이관하고 본문에서 자동 추출하지 않음 |
| 조회 수 | 신뢰할 수 있는 값이 없으면 `0` |
| 알림·이력 | 과거 알림과 변경 이력은 생성하지 않음 |

잘못 연결한 답변은 누락보다 복구하기 어렵기 때문에 질문과의 관계가 불확실한 답변은 임의로 연결하지 않는다. 원본 키와 제외 사유만 이관 보고서에 남긴다.

## 주요 트랜잭션 규칙

- 질문 등록: 질문과 태그를 한 트랜잭션으로 저장한다.
- 답변 등록: 메시지 등록, 질문의 `waiting` → `active` 변경, 알림과 변경 이력을 한 트랜잭션으로 저장한다.
- 최종 답변 지정: 같은 질문의 숨김되지 않은 메시지인지 확인한 뒤 `final_message_id`와 `completed` 상태, 알림과 이력을 한 트랜잭션으로 저장한다.
- 최종 답변 숨김: `final_message_id`를 해제하고 질문 상태를 재계산한 뒤 메시지 숨김과 이력을 한 트랜잭션으로 저장한다.
- 질문과 답변은 물리 삭제하지 않고 `hidden_at`, `hidden_by_user_id`를 갱신한다.
- 답변이 하나라도 존재하는 질문은 일반 작성자가 숨길 수 없고 마스터만 처리할 수 있다.

## 생성 순서

1. `quality_hub_qna_question`을 `final_message_id` FK 없이 생성
2. `quality_hub_qna_message` 생성
3. `quality_hub_qna_question.final_message_id` FK 추가
4. `quality_hub_qna_question_tag` 생성
5. `quality_hub_qna_notification` 생성
6. `quality_hub_qna_history` 생성

실제 DDL은 `db/migrations/002_qna.sql`, 철회 절차는 `db/migrations/002_qna.rollback.sql`로 분리한다. 운영 DB에서 자동 실행하지 않으며, DB 버전·기존 스키마·백업·DBA 승인을 확인한 후 수동 적용한다.

## 실제 DDL 작성 전 확인 사항

1. `SELECT VERSION()` 결과와 MySQL/MariaDB 종류
2. 운영 DB 기본 문자셋과 Collation
3. 운영 SSO `user_id`의 실제 최대 길이와 대소문자 구분 정책
4. `JSON`, `CHECK`, `DATETIME(3)` 지원 여부
5. 기존 Excel의 질문–답변 연결 키, 중복과 NULL 현황
6. 기존 게시판의 신규 작성이 종료됐는지
7. 첨부파일과 리치 텍스트 이미지의 실제 저장 정책
