# Quality Hub 운영 배포 가이드

## 현재 운영 범위

Quality Hub는 Docker Compose의 단일 Node 컨테이너로 운영한다. 컨테이너는 Vite 빌드 화면과 Backend API를 같은 포트에서 제공한다. 기존 사내 리버스 프록시가 HTTPS와 허용 IP를 처리하며 컨테이너 포트는 기본적으로 운영 서버의 `127.0.0.1`에만 공개한다.

이번 전환은 모든 현재 기능을 제공하는 `시범 운영`이다. Q&A 질문·답변·태그·알림·변경 이력은 Backend API와 DB 테이블에 저장한다. SSO 코드와 권한 저장 구조는 구현했지만 실제 사내 로그인과 운영 DB CRUD, 나머지 사내 데이터 연동, 약 50명 성능·보안·접근성 전체 검증은 아직 완료되지 않았으므로 `공개 준비 완료`로 판정하지 않는다. SSO 적용과 철회는 [사내 SSO 적용 및 롤백 안내](SSO_OPERATIONS.md)를 따른다.

## 운영 서버 준비

- Docker Engine과 Docker Compose v2를 설치한다.
- 리버스 프록시에서 전용 도메인의 `/`를 `http://127.0.0.1:<QUALITY_HUB_PORT>`로 전달한다.
- 리버스 프록시에서 HTTPS, 사내망·허용 IP 제한과 HSTS를 적용한다.
- 컨테이너가 MariaDB/MySQL, RAG와 OpenWebUI 주소로 나갈 수 있어야 한다.
- 사용자 브라우저가 현재 화면 글꼴을 받으려면 `cdn.jsdelivr.net`, `fonts.googleapis.com`, `fonts.gstatic.com`에 접근할 수 있어야 한다. 접근할 수 없으면 시스템 기본 글꼴로 표시된다.
- 단일 컨테이너 교체 중에는 짧은 접속 중단이 발생할 수 있다.

리버스 프록시가 다른 서버나 별도 컨테이너에 있다면 `127.0.0.1` 바인딩을 그대로 사용할 수 없다. 이 경우 운영 네트워크에 맞는 주소 또는 전용 Docker 네트워크를 사용하되 앱 포트를 사내 전체에 불필요하게 공개하지 않는다.

## 운영 설정

저장소를 운영 서버의 전용 배포 경로에 두고 환경 소유자가 별도로 관리하는 다음 필수 환경파일 원본을 배치한다.

```bash
test -f .env.db
test -f .env.rag
test -f .env.gpt-oss
test -f .env.sso
test -f prototype/.env.local
```

- `.env.compose`: 이미지 태그와 호스트 바인딩 주소·포트
- `.env.rag`: RAG API 주소와 Credential
- `.env.gpt-oss`: OpenWebUI URL·모델·API token과 선택 설정
- `.env.db`: MariaDB/MySQL 접속정보
- `.env.sso`: SSO와 세션 설정
- `prototype/.env.local`: Vite 빌드에 포함되는 Q&A 라인 표시값

이 다섯 필수 환경파일은 Git에 추가하지 않는다. 개발·빌드·배포 작업은 파일 내용을 생성·수정·덮어쓰지 않고 승인된 원본을 그대로 사용한다. Compose는 루트 환경파일을 컨테이너 실행 환경으로 전달하고, C-DEP용 `docker/Dockerfile-prod`는 C-DEP가 빌드 작업공간에 제공한 원본을 지정 경로로 복사한다. 따라서 C-DEP 이미지와 Artifactory 접근 권한은 비밀정보 취급 기준으로 제한한다. `prototype/.env.local`의 `VITE_` 값은 브라우저 번들에 포함되므로 비밀번호나 인증정보를 넣지 않는다.

`.env.compose`는 위 다섯 필수 환경파일과 별도로 배포 명령에 사용하는 파일이다. 최초 준비와 값 변경은 환경 소유자의 승인된 절차로만 수행하고 애플리케이션 작업에서 수정하지 않는다.

## 배포

설정과 Compose 구성을 먼저 확인한다.

```bash
docker compose --env-file .env.compose config --quiet
docker compose --env-file .env.compose build --pull
docker compose --env-file .env.compose up -d
```

새 배포마다 `.env.compose`의 `QUALITY_HUB_IMAGE_TAG`를 고유하게 변경한다. 같은 태그를 다시 빌드하면 이전 이미지와 구분하기 어렵다.

## 기동 확인

```bash
docker compose --env-file .env.compose ps
curl -fsS http://127.0.0.1:${QUALITY_HUB_PORT:-4173}/healthz
curl -fsS http://127.0.0.1:${QUALITY_HUB_PORT:-4173}/readyz
docker compose --env-file .env.compose logs --tail=100 app
```

`/healthz`의 정상 응답은 `{"status":"ok"}`다. 이 경로는 앱 프로세스의 생존 상태만 확인한다. `/readyz`는 DB·RAG·OpenWebUI와 활성화된 SSO의 필수 환경변수가 입력됐을 때 HTTP 200을 반환하지만 실제 네트워크 연결 성공까지 보장하지 않는다. 최종 연동은 로그인, Agent 질문과 Report·Rule&SOP·Q&A 목록 조회로 별도 확인한다. Q&A 테이블과 행 수는 운영 서버에서 `npm run db:qna:check`로 읽기 전용 확인한 뒤 빈 게시판에서 질문·답변·수정·숨김·복구를 역할별로 검증한다. 로그에는 접속정보, 토큰, Claim 값이나 SQL 원문을 남기지 않는다.

리버스 프록시의 기본 전달 예시는 다음과 같다. 실제 인증서·IP 정책과 설정 위치는 사내 운영 기준을 따른다.

```nginx
location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 180s;
}
```

## 업데이트와 롤백

업데이트 전 현재 이미지 태그와 환경파일을 별도 보관한다. DB 구조를 자동 변경하는 배포는 아니지만 Report 수정·삭제, Agent 대화와 Q&A 변경은 실제 DB에 반영되므로 DB 백업·복구는 기존 DB 운영 절차를 따른다.

문제가 생기면 `.env.compose`의 `QUALITY_HUB_IMAGE_TAG`를 이전에 보관한 이미지 태그로 되돌린 뒤 실행한다.

```bash
docker compose --env-file .env.compose up -d --no-build
```

Q&A 데이터는 서버 이미지나 브라우저 로컬 저장소가 아니라 DB에 남는다. 애플리케이션 이미지 롤백은 DB에 이미 반영된 질문·답변 변경을 되돌리지 않으므로 필요하면 기존 DB 복구 절차를 별도로 수행한다.

## 운영 제한사항

- `SSO_ENABLED=false`인 동안 접근 통제는 사내망·허용 IP에 의존한다. 이 모드의 역할 미리보기와 `x-quality-hub-user-id`는 실제 인증 수단이 아니다.
- SSO 활성화 시 역할 미리보기는 숨겨지고 서버가 검증한 세션과 DB 권한 규칙으로 API 권한을 집행한다. 실제 사내망 동작은 내부 검증 전까지 미검증이다.
- Q&A API는 SSO 활성화 시 서버 세션의 사용자 ID·표시 이름·역할로 소유권과 역할 권한을 검사한다. SSO 비활성화 역할 미리보기 모드의 Header는 테스트 식별값이므로 운영 권한 증거가 아니다.
- Spotfire iframe 허용 정책, 실제 SSO·Claim 매핑, 나머지 사내 데이터, 운영 부하·복구 훈련은 후속 검증이 필요하다.
