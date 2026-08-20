# 사내 SSO 적용 및 롤백 안내

## 적용 구조

Quality Hub 서버가 AD FS OpenID Connect 요청을 직접 처리한다. 인증 응답은 `POST /auth/callback`에서 받으며, `RS256` 서명과 `iss`, `aud`, `exp`, `nonce`, `c_hash`를 검증한 뒤 DB 기반 세션을 만든다. 브라우저가 임의로 보낸 사용자 ID 헤더는 SSO 모드에서 사용하지 않는다.

프록시는 외부 HTTPS 주소를 종료하고 Quality Hub 컨테이너로 전달한다. 가이드의 `cert.pem`, `key.pem`은 Flask가 로컬 HTTPS를 직접 열 때 쓰는 서버 인증서이므로 이 배포 구조에는 넣지 않는다. `stsds*.secsso.net.cer`는 IdP가 JWT에 한 서명을 검증하는 공개 인증서이며 비밀키가 아니다.

## 운영 전 준비

1. 코드 기준 복구점은 로컬 브랜치 `backup/pre-sso-20260814-120653f`이다.
2. 환경 소유자가 별도로 관리하는 승인된 `.env.sso` 원본을 배포 경로에 배치한다. 개발·빌드·배포 작업은 파일 내용을 생성·수정·덮어쓰지 않는다.
3. 개발 또는 운영 IdP 인증서를 `certs/sso/`에 놓고 `SSO_CERTIFICATE_PATH`에 컨테이너 경로를 입력한다.
4. DBA가 `db/migrations/001_sso_auth.sql`을 검토하고 대상 DB에 수동 적용한다. 애플리케이션은 테이블을 자동 생성하지 않는다.
5. IdP 등록 Redirect URI와 `SSO_REDIRECT_URI`를 완전히 동일하게 설정한다. 값은 `https://<웹서비스 주소>/auth/callback` 형식이다.
6. 최초 마스터 ID는 `SSO_BOOTSTRAP_MASTER_USER_IDS`에 입력한다. 마스터 테이블이 비었을 때만 최초 1회 반영된다.

사용자 ID는 Claim 수집 시 영문 소문자로 정규화해 마스터와 사용자 ID 규칙을 비교한다. 소속부서는 원문을 유지한다.

## Claim 키 확인 절차

가이드에 Claim 이름과 issuer가 없으므로 개발 IdP에서 1회 확인한다.

1. `SSO_SAFE_CLAIM_TRACE=true`로 시작한다.
2. 개발 계정으로 로그인한다. 서명, 대상, 만료, nonce, `c_hash` 검증 후 세션은 생성되지 않는다.
3. 서버 로그의 `SSO safe claim trace`에서 `issuer`와 Claim 키/자료형만 확인한다. 토큰과 Claim 값은 출력되지 않는다.
4. `SSO_EXPECTED_ISSUER`, `SSO_USER_ID_CLAIM`, `SSO_DISPLAY_NAME_CLAIM`, `SSO_DEPARTMENT_CLAIM`을 설정한다.
5. `SSO_SAFE_CLAIM_TRACE=false`로 바꾸고 컨테이너를 다시 만든다.

Claim 값, 사용자 ID, 인증 토큰, 세션 secret은 검증 결과 공유나 로그에 포함하지 않는다.

## Compose 적용

기존 Compose 파일만 사용하는 동안에는 SSO 환경파일과 인증서가 컨테이너에 연결되지 않는다. SSO 적용 시에만 오버레이를 추가한다.

```bash
docker compose -f compose.yaml -f compose.sso.yaml config
docker compose -f compose.yaml -f compose.sso.yaml up -d --build --force-recreate
```

`/healthz`는 프로세스 생존 여부, `/readyz`는 설정 입력 여부만 확인한다. 둘 다 실제 사내 로그인 성공을 증명하지 않는다.

로드밸런서나 모니터링이 로그인 주소를 확인해야 한다면 `HEAD /auth/login`을 사용할 수 있다. 이 요청은 `204`만 반환하며 로그인 트랜잭션이나 correlation 쿠키를 만들지 않는다. 일반 생존·준비 상태 확인은 계속 `/healthz`, `/readyz`를 우선한다.

## 세션 만료와 재로그인

- `SSO_SESSION_IDLE_SECONDS` 기본값은 1,800초이며 인증된 API 요청마다 연장된다.
- 실제 세션 종료 시각은 유휴 만료, `SSO_SESSION_ABSOLUTE_SECONDS`, AD FS ID 토큰 만료 중 가장 이른 시각이다.
- 세션 만료 뒤 API의 `401`은 DB 장애가 아니다. 화면은 현재 경로를 `returnTo`로 보존해 `/auth/login`으로 이동하고, 재인증 뒤 원래 화면으로 돌아온다.
- 세션 시간을 늘리기 전에 사내 보안 정책과 IdP 토큰 수명을 확인한다. 프론트 오류를 피하려고 토큰 만료 검증을 완화하지 않는다.

## 즉시 롤백

가장 빠른 애플리케이션 롤백은 `.env.sso`의 `SSO_ENABLED=false`로 변경하고 기존 SSO 오버레이 명령으로 컨테이너를 다시 만드는 것이다. 이때 기존 목업 역할 전환과 기존 API 동작이 복구된다.

오버레이 자체를 제거하려면 기존 명령으로 다시 만든다.

```bash
docker compose -f compose.yaml up -d --build --force-recreate
```

코드 전체를 되돌려야 하면 사용자가 Git 작업물을 먼저 보존한 뒤 `backup/pre-sso-20260814-120653f`를 기준으로 새 배포를 만든다. DB 테이블은 SSO 비활성화 상태에서 남아 있어도 기존 서비스에 영향을 주지 않는다.

테이블까지 철회하는 작업은 데이터 삭제를 수반한다. 별도 백업과 DBA 승인을 받은 뒤에만 `db/migrations/001_sso_auth.rollback.sql`을 실행한다.

## 내부망 확인 결과

다음 항목은 이 저장소 밖의 사내망에서 확인해야 한다.

- 개발 IdP 로그인, callback `form_post`, 개발 인증서 서명 검증
- 실제 issuer와 사용자 ID/표시 이름/소속부서 Claim 키
- 마스터, 관리자, 일반, 접근 차단 역할 판정
- 로그아웃 후 로컬 세션 폐기와 IdP 로그아웃 이동
- 프록시 HTTPS 환경의 Secure/SameSite 쿠키 전달
- 실제 DB 마이그레이션과 권한 규칙 추가·변경·삭제
