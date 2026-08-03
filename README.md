# Quality Hub

공정 품질 지표, 관리 Rule과 문의 정보를 한곳에서 조회하고 관리하기 위한 품질 포털입니다.

## 주요 기능

- 품질 지표 대시보드
- 카테고리별 Spotfire Report 조회
- 사내 LLM 기반 품질 Agent
- 문서 및 Rule 통합 검색
- 관리 Rule 등록과 개정 이력
- 공정·부서별 Q&A
- 사용자 역할과 담당 공정별 권한 관리

## 현재 상태

현재 B 상단 메뉴형을 기본 화면으로 확정하고 대시보드, Report 카탈로그·뷰어와 품질 Agent 목업을 설계하고 있습니다. 로컬 환경에서는 테스트 데이터를 사용하며, Spotfire·사내 LLM·사내 데이터와 SSO는 아직 연결하지 않습니다. 모바일·태블릿 화면은 개발 범위에서 제외합니다.

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

## 실행 방법

리눅스 서버에서 `python3 -m http.server 4173 --bind 0.0.0.0 --directory prototype` 실행 후 `http://<서버주소>:4173`으로 접속합니다.

목업의 모든 수치와 상태는 실제 데이터가 아닌 UI 검토용 예시입니다.
