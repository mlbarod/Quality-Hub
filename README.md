# Quality Hub

공정 품질 지표, 관리 Rule과 문의 정보를 한곳에서 조회하고 관리하기 위한 품질 포털입니다.

## 주요 기능

- 품질 지표 대시보드
- 카테고리별 Spotfire Report 조회
- 사내 LLM 기반 품질 Agent
- 문서 및 Rule 통합 검색
- Rule&SOP 분류별 조회·관리와 개정 이력
- 구분·라인별 Q&A
- 사용자 역할과 담당 공정별 권한 관리

## 현재 상태

현재 B 상단 메뉴형과 가상 데이터 기반 로컬 기능을 제공하고 있습니다. Rule&SOP 문서·개정 이력과 Q&A·내부 알림은 현재 브라우저의 로컬 저장소에 유지되며, 통합 검색은 Report, Rule&SOP와 Q&A 데이터를 함께 검색합니다. 품질 Agent는 사내 RAG·GPT-OSS와 MariaDB/MySQL 대화 History를 Backend API로 연결했으며, 실제 권한 집행, Spotfire·Agent 외 사내 데이터와 SSO는 아직 연결하지 않았습니다. 최신 단계·판정과 남은 검증은 [개발 계획](docs/DEVELOPMENT_PLAN.md)을 단일 기준으로 확인합니다. 모바일·태블릿 화면은 개발 범위에서 제외합니다.

## 프로젝트 문서

- [프로젝트 목표](docs/PROJECT_GOALS.md)
- [품질 포털 요구사항](docs/QUALITY_PORTAL_REQUIREMENTS.md)
- [개발 계획](docs/DEVELOPMENT_PLAN.md)
- [UI/UX 설계 기준](docs/UI_UX_DESIGN.md)
- [메인 개발자 역할](docs/MAIN_DEVELOPER_ROLE.md)
- [작업 지침](AGENTS.md)

## 개발 원칙

- 테스트 데이터와 실제 데이터를 명확히 구분합니다.
- 모든 문서와 보고서는 한국어로 작성합니다.
- 검증되지 않은 기능은 완료로 표시하지 않습니다.

## 개발 실행

Node.js 22 이상이 설치된 로컬 PC에서 처음 한 번 패키지를 설치한 뒤 개발 서버를 실행합니다.

```bash
npm install
npm run dev
```

같은 PC에서는 `http://localhost:4173`, 다른 PC에서는 `http://<서버주소>:4173`으로 접속합니다. `npm run dev`는 `0.0.0.0`에 바인딩하며 소스 변경을 자동 반영합니다.

5500 포트로 실행해야 하는 환경에서는 아래처럼 포트를 지정합니다. `--port=5500` 형식도 사용할 수 있습니다.

```bash
npm run dev -- --port 5500
```

로컬 PC에서만 확인하려면 아래 명령을 사용합니다.

```bash
HOST=127.0.0.1 npm run dev
```

배포 형태의 화면 산출물만 확인하려면 `npm run build` 후 `npm run preview`를 실행합니다. Backend API까지 함께 확인하려면 `npm run start:static`을 사용합니다. `npm start`는 기존 빌드 결과와 Backend API를 제공하며 빌드 결과가 없으면 시작하지 않습니다. 개발 서버를 운영에 잘못 실행하지 않도록 기본 실행 모드는 빌드 모드입니다.

개발 서버는 인증과 HTTPS를 제공하지 않으므로 인터넷에 직접 공개하지 않습니다.

## 운영 배포

운영은 Docker Compose로 빌드된 화면과 Backend API를 함께 실행합니다. 컨테이너 포트는 기본적으로 운영 서버의 `127.0.0.1`에만 연결하고, 기존 사내 리버스 프록시에서 HTTPS와 허용 IP를 처리합니다.

```bash
cp .env.compose.example .env.compose
docker compose --env-file .env.compose config --quiet
docker compose --env-file .env.compose build --pull
docker compose --env-file .env.compose up -d
curl -fsS http://127.0.0.1:4173/healthz
```

비밀정보 준비, 리버스 프록시, 업데이트와 롤백 절차는 [운영 배포 가이드](docs/OPERATIONS.md)를 따릅니다. 현재는 모든 기능을 제공하지만 일부 기능이 브라우저 로컬 데이터에 머무는 시범 운영이며, 실제 SSO 권한이나 공개 준비 완료를 의미하지 않습니다.

목업의 모든 수치와 상태는 실제 데이터가 아닌 UI 검토용 예시입니다.

## Q&A 라인 카테고리 설정

Q&A 작성 화면의 라인 목록은 코드에 저장하지 않고 `prototype/.env.local`에서 읽습니다. 아래 환경변수에 실제 라인 이름을 쉼표로 구분해 입력한 뒤 개발 서버를 다시 시작합니다.

```dotenv
VITE_QNA_LINE_CATEGORIES=첫번째라인,두번째라인
```

`prototype/.env.local`은 Git에서 제외됩니다. `VITE_` 환경변수 값은 브라우저 화면에 제공되는 값이므로 라인 표시값 외의 비밀번호나 인증정보는 입력하지 않습니다. 공유용 형식은 `prototype/.env.example`에서 확인할 수 있습니다.

## RAG API Client 확인

루트의 `.env.rag.example`을 `.env.rag`으로 복사하고 문서 검색·인덱스 조회·문서 추가·문서 삭제 URL과 사내에서 발급받은 공통 설정을 입력합니다. `.env.rag`은 Git에서 제외됩니다.

```bash
cp .env.rag.example .env.rag
```

각 API는 다음 명령으로 독립 호출합니다.

```bash
npm run rag:search -- "반도체에 대해 알려주세요"
npm run rag:index
npm run rag:document:add
npm run rag:document:delete -- "0000ABCD"
```

`rag:document:add`는 공식 가이드의 예시 문서 `ABCD00001`을 실제 인덱스에 추가하며, `rag:document:delete`는 전달한 `doc_id`의 문서를 실제로 삭제합니다. 실행 전 대상 인덱스와 문서 ID를 확인해야 합니다. RAG 검색 Client는 Backend Chat 흐름에서 재사용하지만 Quality Agent UI에는 아직 연결되지 않습니다.

## GPT-OSS Chat Completions Client 확인

루트의 `.env.gpt-oss.example`을 `.env.gpt-oss`으로 복사하고 사내 API 설정을 입력합니다. `GPT_OSS_API_URL`에는 DS API HUB URL 끝에 `/v1`을 추가한 전체 base URL을 사용합니다. 실제 인증에 사용하는 credential은 `GPT_OSS_CREDENTIAL_KEY`에 입력하며 `.env.gpt-oss`은 Git에서 제외됩니다.

```bash
cp .env.gpt-oss.example .env.gpt-oss
npm run gpt-oss:chat -- "You are a helpful assistant." "How are you?"
```

두 메시지를 생략하면 공식 예제의 system/user message를 사용합니다. 이 명령은 `gpt-oss-120b` Chat Completions API만 독립 호출합니다. GPT-OSS Client는 Backend Chat 흐름에서 재사용하지만 Quality Agent UI에는 아직 연결되지 않습니다.

## LLM 대화 History DB 확인

루트의 `.env.db.example`을 `.env.db`로 복사하고 이미 생성된 MariaDB/MySQL의 접속정보를 입력합니다. `.env.db`는 Git에서 제외되며, 확인 명령은 테이블을 생성하거나 변경하지 않습니다.

```bash
cp .env.db.example .env.db
npm run db:history:check
```

특정 검증용 `user_id`를 사용하려면 인자로 전달할 수 있습니다.

```bash
npm run db:history:check -- "quality.hub.db.check"
```

이 명령은 connection pool을 통해 conversation 생성·사용자별 목록 조회·user/assistant message 저장·message 조회·다른 사용자 접근 차단·conversation 삭제를 순서대로 확인합니다. 검증 중 생성한 conversation과 소속 message는 성공 시 삭제하며, 중간 실패 시에도 정리를 시도합니다. 이 저장소는 Backend Chat과 Quality Agent UI에서 재사용합니다.

## Backend Chat 통합 확인

`.env.rag`, `.env.gpt-oss`, `.env.db`에 앞서 독립 검증한 실제 사내 설정을 입력한 뒤 user ID와 질문을 전달합니다. conversation ID를 생략하면 질문 제목으로 새 conversation을 만들며, 전달하면 해당 사용자가 소유한 기존 conversation의 최근 완료 History를 사용합니다.

```bash
npm run backend:chat:check -- "quality.kim" "질문 내용"
npm run backend:chat:check -- "quality.kim" "후속 질문" "기존-conversation-uuid"
```

이 명령은 user message 저장 → RAG 검색과 `hits.hits[]`의 제목·본문·점수 Context 구성 → 최근 완료 message 최대 6건을 실제 대화 role과 6,000자 예산으로 적용 → 기존 규격의 GPT-OSS 호출 → assistant 답변과 RAG 출처 JSON 저장을 순서대로 실행합니다. RAG 결과 0건은 정상 처리하며, RAG·GPT-OSS·DB 실패는 서로 다른 단계로 출력하고 user message의 `status`에 `rag_failed`, `gpt_failed`, `db_failed` 기록을 시도합니다. 외부 API를 기다리는 동안 DB transaction을 유지하지 않습니다.

개발 환경에서 정확도 확인이 필요하면 `QUALITY_AGENT_SAFE_TRACE=1 npm run dev`로 서버를 실행합니다. 서버 콘솔에는 질문·문서 원문, Credential, 사용자 ID 대신 질문 길이, RAG hit 수와 필드명, Context 길이, History 개수·길이, 최종 message role·길이, 모델과 temperature만 기록됩니다. 운영 컨테이너에서는 필요한 점검 시간에만 같은 환경변수를 주입하고 확인 후 제거합니다.

## Quality Agent UI 통합 확인

루트의 `.env.rag`, `.env.gpt-oss`, `.env.db`를 입력하고 `npm run dev`로 실행하면 우측 패널과 전체 화면이 같은 Backend conversation을 사용합니다. 서버는 실행한 작업 디렉터리와 관계없이 프로젝트 루트의 세 환경파일을 직접 읽습니다. 환경파일을 변경한 경우 실행 중인 서버를 종료하고 다시 시작해야 합니다. 실제 SSO 전까지 상단 역할 미리보기의 `user_id`를 테스트 식별값으로 전달합니다. Agent API가 실패하면 서버 콘솔의 `Quality Agent API failure` 로그에서 실패 단계와 DB 오류 코드를 확인할 수 있으며 접속정보와 SQL 원문은 기록하지 않습니다.

브라우저에서 품질 Agent를 열어 새 대화 생성, 질문 전송, 읽기 쉽게 정제된 답변 표시, 전체 화면 확장, 대화 선택·삭제를 확인합니다. `<br>` 줄바꿈, Markdown 강조·목록·표는 안전한 DOM 요소로 변환하며 RAG 출처 정보는 사용자 화면에 표시하지 않습니다. 선택한 conversation ID는 브라우저에만 보관하고 실제 message와 conversation은 DB에서 다시 불러오므로 새로고침 후에도 History가 복원됩니다. Streaming은 적용하지 않았습니다.
