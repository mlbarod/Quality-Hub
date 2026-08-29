#!/usr/bin/env python3
"""이전 Q&A JSON을 Quality Hub DB에 한 번에 적재하는 실행 파일.

아래 설정값만 수정한 뒤 다음과 같이 실행한다.

    python3 /경로/qna_json_migration_notebook.py

이 파일과 qna_json_migration.py는 같은 폴더에 두어야 한다.
"""

from __future__ import annotations

import getpass
import json
import subprocess
import sys
from pathlib import Path


# ============================================================================
# 이 다섯 값만 실제 환경에 맞게 수정하세요.
# JSON_FILE은 전체 경로 또는 이 파일을 기준으로 한 상대 경로를 사용할 수 있습니다.
# ============================================================================
JSON_FILE = r"/원본/파일/경로/legacy_qna.json"
DB_HOST = "DB서버주소"
DB_PORT = 3306
DB_USER = "DB사용자"
DB_NAME = "대상DB명"


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import qna_json_migration as migration  # noqa: E402


def resolve_json_path() -> Path:
    path = Path(JSON_FILE).expanduser()
    if not path.is_absolute():
        path = SCRIPT_DIR / path
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f"원본 JSON 파일을 찾을 수 없습니다: {path}")
    return path


def ensure_mysql_driver() -> None:
    try:
        import mysql.connector  # type: ignore[import-not-found]  # noqa: F401
    except ImportError:
        print("mysql-connector-python을 현재 Python 환경에 설치합니다...")
        subprocess.check_call([
            sys.executable,
            "-m",
            "pip",
            "install",
            "mysql-connector-python",
        ])


def ensure_not_completed(report_path: Path) -> None:
    if not report_path.is_file():
        return
    try:
        previous_report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if previous_report.get("status") == "completed":
        raise RuntimeError(
            "이 JSON은 이미 적재 완료 보고서가 있어 중복 실행을 중단합니다: "
            f"{report_path}"
        )


def run() -> None:
    json_path = resolve_json_path()
    report_path = json_path.with_name(f"{json_path.stem}.migration-report.json")
    ensure_not_completed(report_path)

    report = migration.MigrationReport(mode="python-apply", source_file=str(json_path))
    connection = None
    try:
        questions = migration.load_and_transform(json_path, report)
        if report.errors:
            raise migration.MigrationError(
                f"{len(report.errors)}개 행에 오류가 있습니다. 보고서의 errors를 확인하세요."
            )
        if not questions:
            raise migration.MigrationError("이관할 질문이 없습니다.")

        print("JSON 검증 완료")
        print(f"  질문: {report.valid_questions:,}건")
        print(f"  답변: {report.valid_messages:,}건")
        print(f"  경고: {len(report.warnings):,}건")
        if report.warning_counts:
            print(f"  경고 종류: {report.warning_counts}")

        ensure_mysql_driver()
        db_password = getpass.getpass("DB 비밀번호: ")
        config = {
            "host": DB_HOST,
            "port": int(DB_PORT),
            "user": DB_USER,
            "password": db_password,
            "database": DB_NAME,
            "charset": "utf8mb4",
        }

        connection, driver = migration.connect_database(config)
        config["password"] = None
        db_password = ""
        report.target["driver"] = driver
        migration.apply_migration(connection, questions, report, allow_nonempty=True)
        report.status = "completed"

        print("\nDB 적재 완료")
        print(f"  질문: {report.inserted_questions:,}건")
        print(f"  답변: {report.inserted_messages:,}건")
        print(f"  대상 DB: {report.target.get('database')}")
        print(f"  ID 대응표 및 결과 보고서: {report_path}")
    except migration.MigrationError as error:
        report.status = "failed"
        report.failure = str(error)
        if connection is not None:
            connection.rollback()
        print(f"\n이관 중단: {error}", file=sys.stderr)
        print(f"상세 보고서: {report_path}", file=sys.stderr)
        raise
    except Exception as error:
        report.status = "failed"
        report.failure = "database_or_runtime_error"
        if connection is not None:
            connection.rollback()
        error_code = getattr(error, "errno", None)
        if isinstance(error_code, int):
            report.target["error_code"] = error_code
        print("\n이관 실패: 전체 작업을 롤백했습니다.", file=sys.stderr)
        print(f"상세 보고서: {report_path}", file=sys.stderr)
        raise
    finally:
        if connection is not None:
            connection.close()
        migration.write_report(report_path, report)


if __name__ == "__main__":
    run()
