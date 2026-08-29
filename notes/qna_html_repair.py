#!/usr/bin/env python3
"""이관된 Q&A 질문 본문의 표·Base64 그림 HTML을 원본 JSON에서 복구한다.

아래 설정값을 수정한 뒤 실행한다.

    python3 /경로/qna_html_repair.py

qna_json_migration.py, 원본 JSON, 적재 완료 migration-report가 필요하다.
"""

from __future__ import annotations

import base64
import binascii
import getpass
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


# ============================================================================
# 이 다섯 값만 실제 환경에 맞게 수정하세요.
# JSON_FILE은 전체 경로 또는 이 파일을 기준으로 한 상대 경로를 사용할 수 있습니다.
# ============================================================================
JSON_FILE = r"/원본/파일/경로/legacy_qna.json"
DB_HOST = "DB서버주소"
DB_PORT = 3306
DB_USER = "DB사용자"
DB_NAME = "대상DB명"

# 기본값은 원본 JSON 옆의 '<파일명>.migration-report.json'입니다.
# 보고서를 다른 이름으로 만들었다면 전체 경로를 입력하세요.
MIGRATION_REPORT = ""


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import qna_json_migration as migration  # noqa: E402


class RepairError(Exception):
    pass


class _ImageSourceCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.sources: list[str | None] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "img":
            return
        values = {name.lower(): value for name, value in attrs}
        self.sources.append(values.get("src"))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)


def resolve_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = SCRIPT_DIR / path
    return path.resolve()


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


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as error:
        raise RepairError(f"파일을 찾을 수 없습니다: {path}") from error
    except json.JSONDecodeError as error:
        raise RepairError(f"JSON 형식이 올바르지 않습니다: {path} ({error.msg})") from error


def count_tag(value: str, tag: str) -> int:
    return len(re.findall(rf"<\s*{tag}\b", value, flags=re.IGNORECASE))


def image_sources(value: str) -> list[str]:
    collector = _ImageSourceCollector()
    collector.feed(value)
    collector.close()
    if any(source is None for source in collector.sources):
        raise RepairError("src가 없는 그림 태그가 있습니다")
    return [str(source) for source in collector.sources]


def validate_embedded_image(source: str) -> None:
    if not source.lower().startswith("data:image/"):
        return
    match = re.fullmatch(
        r"data:image/(png|jpeg|gif|webp);base64,(.+)",
        source,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise RepairError("지원하지 않는 Base64 그림 형식이 있습니다")
    mime = match.group(1).lower()
    encoded = re.sub(r"\s+", "", match.group(2))
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise RepairError("손상된 Base64 그림 데이터가 있습니다") from error
    signatures = {
        "png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
        "jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
        "gif": lambda data: data.startswith((b"GIF87a", b"GIF89a")),
        "webp": lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
    }
    if not signatures[mime](decoded):
        raise RepairError(f"Base64 내용이 선언된 {mime} 그림 형식과 일치하지 않습니다")


def prepare_repairs(source_payload: Any, migration_payload: Any) -> list[dict[str, Any]]:
    if migration_payload.get("status") != "completed":
        raise RepairError("적재 완료 상태의 migration-report가 아닙니다")
    mappings = migration_payload.get("id_mapping")
    if not isinstance(mappings, list) or not mappings:
        raise RepairError("migration-report에 id_mapping이 없습니다")
    if not isinstance(source_payload, dict) or not isinstance(source_payload.get(migration.ROOT_KEY), list):
        raise RepairError(f"원본 JSON에 '{migration.ROOT_KEY}' 배열이 없습니다")

    records: dict[str, dict[str, Any]] = {}
    for record in source_payload[migration.ROOT_KEY]:
        if not isinstance(record, dict):
            continue
        legacy_id = migration.parse_legacy_id(record.get("id"))
        if legacy_id in records:
            raise RepairError(f"원본 JSON에 중복 id가 있습니다: {legacy_id}")
        records[legacy_id] = record

    repairs: list[dict[str, Any]] = []
    for mapping in mappings:
        legacy_id = str(mapping.get("legacy_id", ""))
        question_id = mapping.get("question_id")
        if legacy_id not in records:
            raise RepairError(f"원본 JSON에서 매핑된 id를 찾을 수 없습니다: {legacy_id}")
        if not isinstance(question_id, int) or question_id <= 0:
            raise RepairError(f"신규 question_id가 올바르지 않습니다: {legacy_id}")
        record = records[legacy_id]
        raw_html = "" if record.get("req_comment") is None else str(record["req_comment"])
        repaired_html = migration.sanitize_legacy_html(raw_html)
        repaired_text = re.sub(r"\s+", " ", migration.legacy_plain_text(raw_html)).strip()
        if not repaired_text:
            raise RepairError(f"질문 평문 본문이 없습니다: {legacy_id}")

        raw_image_count = count_tag(raw_html, "img")
        repaired_image_count = count_tag(repaired_html, "img")
        raw_table_count = count_tag(raw_html, "table")
        repaired_table_count = count_tag(repaired_html, "table")
        if raw_image_count != repaired_image_count:
            raise RepairError(f"그림 태그 복원 개수가 일치하지 않습니다: {legacy_id}")
        if raw_table_count != repaired_table_count:
            raise RepairError(f"표 태그 복원 개수가 일치하지 않습니다: {legacy_id}")
        sources = image_sources(repaired_html)
        for source in sources:
            validate_embedded_image(source)

        repairs.append({
            "legacy_id": legacy_id,
            "question_id": question_id,
            "title": migration.normalize_nfkc(record.get("title")),
            "body_html": repaired_html,
            "body_text": repaired_text,
            "expected_old_html": migration.safe_html_from_text(migration.legacy_plain_text(raw_html)),
            "image_count": repaired_image_count,
            "embedded_image_count": sum(source.lower().startswith("data:image/") for source in sources),
            "table_count": repaired_table_count,
        })
    return repairs


def write_private_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(path, 0o600)


def run() -> None:
    json_path = resolve_path(JSON_FILE)
    migration_report_path = resolve_path(MIGRATION_REPORT) if MIGRATION_REPORT else json_path.with_name(
        f"{json_path.stem}.migration-report.json"
    )
    repair_report_path = json_path.with_name(f"{json_path.stem}.html-repair-report.json")
    if repair_report_path.is_file():
        previous = read_json(repair_report_path)
        if previous.get("status") == "completed":
            raise RepairError(f"이미 HTML 복구가 완료되어 중복 실행을 중단합니다: {repair_report_path}")

    report: dict[str, Any] = {
        "status": "started",
        "source_file": str(json_path),
        "migration_report": str(migration_report_path),
        "target_database": DB_NAME,
        "updated_questions": 0,
        "skipped_questions": 0,
        "image_count": 0,
        "embedded_image_count": 0,
        "table_count": 0,
        "backup_file": None,
        "failure": None,
    }
    connection = None
    try:
        repairs = prepare_repairs(read_json(json_path), read_json(migration_report_path))
        ensure_mysql_driver()
        password = getpass.getpass("DB 비밀번호: ")
        connection, driver = migration.connect_database({
            "host": DB_HOST,
            "port": int(DB_PORT),
            "user": DB_USER,
            "password": password,
            "database": DB_NAME,
            "charset": "utf8mb4",
        })
        password = ""
        report["driver"] = driver
        cursor = connection.cursor()
        backups: list[dict[str, Any]] = []
        updates: list[dict[str, Any]] = []
        try:
            cursor.execute("SELECT DATABASE(), @@max_allowed_packet")
            database_name, max_allowed_packet = cursor.fetchone()
            if str(database_name) != DB_NAME:
                raise RepairError("실제 연결된 DB와 DB_NAME이 일치하지 않습니다")
            report["max_allowed_packet"] = int(max_allowed_packet)

            for repair in repairs:
                body_size = len(repair["body_html"].encode("utf-8"))
                if body_size + 8_192 >= int(max_allowed_packet):
                    raise RepairError(
                        f"복구할 본문이 DB max_allowed_packet보다 큽니다: {repair['legacy_id']}"
                    )
                cursor.execute(
                    "SELECT title, body_html, body_text FROM quality_hub_qna_question "
                    "WHERE question_id = %s FOR UPDATE",
                    (repair["question_id"],),
                )
                row = cursor.fetchone()
                if row is None:
                    raise RepairError(f"DB에서 질문을 찾을 수 없습니다: {repair['question_id']}")
                current_title, current_html, current_text = map(lambda value: "" if value is None else str(value), row)
                if migration.normalize_nfkc(current_title) != repair["title"]:
                    raise RepairError(f"원본과 DB의 질문 제목이 일치하지 않습니다: {repair['legacy_id']}")
                if current_html == repair["body_html"]:
                    report["skipped_questions"] += 1
                    continue
                if current_html != repair["expected_old_html"]:
                    raise RepairError(
                        f"이관 후 본문이 별도로 수정된 질문이 있어 덮어쓰지 않습니다: {repair['legacy_id']}"
                    )
                backups.append({
                    "question_id": repair["question_id"],
                    "body_html": current_html,
                    "body_text": current_text,
                })
                updates.append(repair)

            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup_path = json_path.with_name(f"{json_path.stem}.html-repair-backup-{timestamp}.json")
            write_private_json(backup_path, {"database": DB_NAME, "questions": backups})
            report["backup_file"] = str(backup_path)

            for repair in updates:
                cursor.execute(
                    "UPDATE quality_hub_qna_question SET body_html = %s, body_text = %s "
                    "WHERE question_id = %s",
                    (repair["body_html"], repair["body_text"], repair["question_id"]),
                )
                if cursor.rowcount != 1:
                    raise RepairError(f"질문 본문 갱신 건수가 올바르지 않습니다: {repair['legacy_id']}")
                report["updated_questions"] += 1
                report["image_count"] += repair["image_count"]
                report["embedded_image_count"] += repair["embedded_image_count"]
                report["table_count"] += repair["table_count"]
            connection.commit()
            report["status"] = "completed"
        finally:
            cursor.close()

        print("HTML 본문 복구 완료")
        print(f"  갱신 질문: {report['updated_questions']:,}건")
        print(f"  Base64 그림: {report['embedded_image_count']:,}개")
        print(f"  표: {report['table_count']:,}개")
        print(f"  결과 보고서: {repair_report_path}")
    except RepairError as error:
        if connection is not None:
            connection.rollback()
        report["status"] = "failed"
        report["failure"] = str(error)
        print(f"HTML 복구 중단: {error}", file=sys.stderr)
        raise
    except Exception as error:
        if connection is not None:
            connection.rollback()
        report["status"] = "failed"
        report["failure"] = "database_or_runtime_error"
        error_code = getattr(error, "errno", None)
        if isinstance(error_code, int):
            report["error_code"] = error_code
        print("HTML 복구 실패: 전체 작업을 롤백했습니다.", file=sys.stderr)
        raise
    finally:
        if connection is not None:
            connection.close()
        write_private_json(repair_report_path, report)


if __name__ == "__main__":
    run()
