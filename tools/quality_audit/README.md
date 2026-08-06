# Quality Hub 전체 검수기

현재 저장소의 코드, 자동 테스트, 빌드, 정적 서버, 대표 브라우저 흐름, 접근성과 로컬 성능을 한 번에 점검하는 Python 검수기입니다. 검수 실행은 사용자가 직접 수행합니다.

## 자원 사용 방식

- 기본 `--cpu-budget 1.75`
- Linux에서는 현재 프로세스와 모든 자식 프로세스를 허용된 논리 CPU 중 2개에 묶습니다.
- 정적 검사와 독립적인 테스트·빌드는 최대 2개 실행 슬롯에서 병렬 처리합니다.
- 비용이 큰 Node 테스트, Vitest와 Vite 빌드를 우선 배치해 두 CPU가 함께 일하는 구간을 늘립니다.
- 서로 독립적인 브라우저 기능 검사는 별도 Chromium 프로필 2개로 병렬 실행합니다.
- 로컬 성능 측정은 병렬 Chromium의 간섭을 피하기 위해 마지막에 단독 실행합니다.
- OpenMP, BLAS, Rayon과 Node의 libuv 스레드 수도 2로 제한합니다.
- 기본 설정은 CPU 작업이 겹치는 동안 1.5 Core 이상 활용하는 것을 목표로 합니다. 다만 파일·네트워크·브라우저 대기 구간까지 포함한 전체 실행 평균을 보장하는 CPU 예약 방식은 아닙니다.
- OS affinity를 이용해 **최대 2개 논리 CPU만 사용하도록 상한을 제한**하므로 다른 업무의 CPU를 과도하게 점유하지 않습니다.
- 다른 작업과 자원을 나눠야 하면 `--cpu-budget 1`을 사용하세요.

## 검수 범위

| 영역 | 주요 검사 |
| --- | --- |
| 작업 트리 | 실행 전후 Git 상태 비교, `git diff --check` |
| 코드·문서 | 소스 인벤토리와 SHA-256, 비밀정보 패턴, 위험 API, 목업·운영 경계 |
| 자동 테스트 | 검수기 자체 단위 테스트, Node 계약·서버 테스트, Vitest React 테스트 |
| 빌드 | 별도 결과 폴더 Vite 프로덕션 빌드, 산출물 크기 |
| HTTP | 정적 자산, 보안 헤더, HEAD·404·405·잘못된 경로·경로 이탈 |
| 화면 | 1366×768, 1440×900, 1920×1080과 수평 넘침, 스크린샷 |
| 역할·상태 | 마스터·관리자·일반유저·접근 차단, 6개 공통 화면 상태 |
| Q&A | 일반유저 답변 등록 후 관리자 최종 답변 지정 |
| 접근성 | axe 대표 화면 7종, 검색 목적지 초점, Agent 랜드마크, 동작 축소 |
| 성능·안정성 | FCP·load·Report·Q&A·편집기 시간, 50ms 초과 긴 작업, 런타임 오류 |

이 검수기는 실제 SSO, Spotfire, 사내 LLM, DB, Parquet, 공유 폴더, 운영 권한 집행이나 약 50명 동시 사용을 검증하지 않습니다.

## 실행 조건

- Linux 권장
- Python 3.10 이상
- Node.js, npm, Git
- 저장소 의존성이 설치된 `node_modules`
- 브라우저 검사 시 Chromium 또는 Chrome
- loopback 서버와 헤드리스 Chromium 실행 권한

Playwright 캐시 Chromium이 시스템 라이브러리를 별도로 요구하는 환경에서는 실행 전에 필요한 `LD_LIBRARY_PATH`도 설정해야 합니다. 현재 셸 환경 변수는 Chromium 자식 프로세스에 그대로 전달됩니다.

Chromium 자동 탐색 순서:

1. `QUALITY_AUDIT_CHROME`
2. `google-chrome`, `chromium` 등 PATH 실행 파일
3. Playwright 캐시의 Chromium

## 실행

저장소 루트에서:

```bash
python3 tools/quality_audit/run_audit.py
```

Chromium 경로를 직접 지정하려면:

```bash
QUALITY_AUDIT_CHROME=/path/to/chrome \
python3 tools/quality_audit/run_audit.py
```

결과 폴더와 시간 제한을 지정하려면:

```bash
python3 tools/quality_audit/run_audit.py \
  --cpu-budget 1.75 \
  --command-timeout 900 \
  --browser-timeout 60 \
  --output /tmp/quality-hub-full-audit
```

외부 npm 레지스트리의 취약점 조회까지 포함하려면:

```bash
python3 tools/quality_audit/run_audit.py --include-network
```

브라우저를 실행할 수 없는 서버에서는:

```bash
python3 tools/quality_audit/run_audit.py --skip-browser
```

도움말:

```bash
python3 tools/quality_audit/run_audit.py --help
```

## 결과

기본 결과 경로는 다음과 같습니다.

```text
tools/quality_audit/results/YYYYMMDD-HHMMSS/
├── report.md
├── report.json
├── source-inventory.json
├── logs/
└── screenshots/
```

- `report.md`: 사람이 읽는 한국어 종합 보고서
- `report.json`: 후속 자동화에 사용할 구조화 결과
- `logs/`: 테스트·빌드·서버·Chromium 원본 로그
- `screenshots/`: 세 화면 크기의 현재 화면 증거
- `work/`: `--keep-work`를 지정한 경우에만 임시 빌드와 Chromium 프로필 보존

검수용 빌드는 결과 폴더 안에서 생성합니다. 저장소의 기존 `dist`를 덮어쓰지 않습니다. 실행 전후 Git porcelain 상태가 달라지면 `GIT-01`을 실패로 기록합니다.

사용자 지정 `--output`을 저장소 내부에 둘 경우에는 Git 상태 오염을 막기 위해 `tools/quality_audit/results` 아래만 허용합니다. 그 밖의 위치는 `/tmp`처럼 저장소 외부 경로를 사용하세요.

## 판정과 종료 코드

- `PASS`: 확인한 기준 통과
- `WARN`: 실행은 통과했지만 수동 검토나 최적화 필요
- `FAIL`: 확인한 요구사항 또는 계약 실패
- `SKIP`: 조건 또는 옵션 때문에 미실행
- `ERROR`: 환경 문제나 검수기 실행 오류로 판단 불가

종료 코드는 다음과 같습니다.

- `0`: `FAIL`·`ERROR` 없음. `WARN`·`SKIP`은 있을 수 있음
- `1`: 하나 이상의 `FAIL` 또는 `ERROR`
- `2`: 실행 준비 또는 검수기 자체 오류
- `130`: 사용자 중단

`SKIP`과 `WARN`은 성공 근거가 아닙니다. 특히 Chromium 미탐지, npm audit 미실행, 긴 작업 경고는 보고서의 제한사항으로 확인해야 합니다.

## 주의사항

- 기본 실행은 외부 네트워크에 접속하지 않습니다.
- `--include-network`만 npm 레지스트리에 접속할 수 있습니다.
- 실제 사내 시스템과 운영 데이터에는 접근하지 않습니다.
- 헤드리스 Chromium과 정적 서버는 검수 종료 시 정리합니다.
- 실행 중 `Ctrl+C`로 중단해도 가능한 범위에서 보고서를 작성하고 자식 프로세스를 종료합니다.
- 이미 변경된 작업 트리에서도 실행할 수 있으며, 기존 변경을 실패로 보지 않고 **검수 전후 차이**만 확인합니다.
