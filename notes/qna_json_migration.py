#!/usr/bin/env python3
"""이전 게시판 JSON을 Quality Hub Q&A 테이블로 이관한다.

이 스크립트는 기본 실행 시 JSON만 검증하며 DB를 변경하지 않는다. 실제 적재는
반드시 ``--apply --confirm-db <DB명>``을 함께 지정해야 한다.

``req_comment``는 질문 본문으로 저장한다. ``ans_comment``와 ``add_comment``는
각각 답변 1, 답변 2로 저장하며 두 답변은 원본 구조상 같은 답변자와 답변 시각을
사용한다.
원본 ``id``는 17자리도 손실 없이 문자열로 읽고, DB의 ``question_id``는 자동
발급받는다. 적재 보고서에는 원본 ID와 신규 ID의 매핑을 남긴다. ``no``는 보고서
검증에만 사용한다.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import unicodedata
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable, Sequence


ROOT_KEY = "incident_list$voe"
MAX_SAFE_JAVASCRIPT_INTEGER = 9_007_199_254_740_991
QUESTION_TABLE = "quality_hub_qna_question"
MESSAGE_TABLE = "quality_hub_qna_message"

REQUIRED_COLUMNS = {
    QUESTION_TABLE: {
        "question_id",
        "title",
        "body_html",
        "body_text",
        "category",
        "line_name",
        "status",
        "author_user_id",
        "author_display_name",
        "final_message_id",
        "view_count",
        "created_at",
        "updated_at",
        "hidden_at",
        "hidden_by_user_id",
    },
    MESSAGE_TABLE: {
        "message_id",
        "question_id",
        "body_html",
        "body_text",
        "author_user_id",
        "author_display_name",
        "created_at",
        "updated_at",
        "hidden_at",
        "hidden_by_user_id",
    },
}

# 실제 이전 데이터의 표현이 다르면 이 사전만 보완한다. 알 수 없는 값은 본문 유무를
# 기준으로 status를 정하고 category는 '미분류'로 저장하며 보고서에 경고를 남긴다.
CATEGORY_ALIASES = {
    "rule": "Rule",
    "rule&sop": "Rule",
    "rule & sop": "Rule",
    "spc": "SPC",
    "fdc": "FDC",
    "tttm": "TTTM",
    "report": "Report",
    "wf loss": "WF Loss",
    "wfloss": "WF Loss",
    "미분류": "미분류",
}

STATUS_ALIASES = {
    "waiting": "waiting",
    "대기": "waiting",
    "답변대기": "waiting",
    "답변 대기": "waiting",
    "미답변": "waiting",
    "접수": "waiting",
    "active": "active",
    "진행": "active",
    "진행중": "active",
    "진행 중": "active",
    "답변중": "active",
    "답변 중": "active",
    "completed": "completed",
    "complete": "completed",
    "완료": "completed",
    "답변완료": "completed",
    "답변 완료": "completed",
}

MESSAGE_FIELDS = (
    ("ans_comment", "답변 1"),
    ("add_comment", "답변 2"),
)

ALLOWED_LEGACY_HTML_TAGS = {
    "a", "b", "blockquote", "br", "caption", "code", "col", "colgroup",
    "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img",
    "li", "ol", "p", "pre", "s", "span", "strike", "strong", "sub", "sup",
    "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
}
VOID_LEGACY_HTML_TAGS = {"br", "col", "hr", "img"}
DANGEROUS_LEGACY_HTML_TAGS = {
    "button", "embed", "form", "iframe", "input", "link", "math", "meta",
    "object", "option", "script", "select", "style", "svg", "textarea",
}
LEGACY_HTML_ATTRIBUTES = {
    "a": {"href", "rel", "target", "title"},
    "img": {"alt", "height", "src", "title", "width"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
    "col": {"span", "width"},
}
MAX_MEDIUMTEXT_BYTES = 16_777_215


class MigrationError(Exception):
    """안전하게 사용자에게 표시할 수 있는 이관 오류."""


class _PlainTextExtractor(HTMLParser):
    BLOCK_TAGS = {
        "address", "article", "aside", "blockquote", "div", "dl", "fieldset",
        "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4",
        "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre",
        "section", "table", "tr", "ul",
    }
    SKIP_TAGS = {"script", "style", "iframe", "object", "embed"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        tag = tag.lower()
        if tag in self.SKIP_TAGS:
            self.skip_depth += 1
        elif self.skip_depth == 0 and (tag == "br" or tag in self.BLOCK_TAGS):
            self.parts.append("\n")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        tag = tag.lower()
        if self.skip_depth == 0 and (tag == "br" or tag in self.BLOCK_TAGS):
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self.SKIP_TAGS:
            self.skip_depth = max(0, self.skip_depth - 1)
        elif self.skip_depth == 0 and tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0:
            self.parts.append(data)

    def text(self) -> str:
        return "".join(self.parts)


class _SafeLegacyHtmlParser(HTMLParser):
    """표와 Base64 그림은 보존하고 실행 가능한 HTML은 제거한다."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.open_tags: list[str] = []
        self.skip_depth = 0

    @staticmethod
    def _safe_url(tag: str, name: str, value: str) -> bool:
        normalized = value.strip()
        if tag == "img" and name == "src":
            return bool(re.match(
                r"^(?:https?:|/|data:image/(?:png|jpeg|gif|webp);base64,)",
                normalized,
                flags=re.IGNORECASE,
            ))
        if tag == "a" and name == "href":
            return bool(re.match(r"^(?:https?:|mailto:|#|/)", normalized, flags=re.IGNORECASE))
        return True

    def _attributes(self, tag: str, attrs: list[tuple[str, str | None]]) -> str:
        allowed = LEGACY_HTML_ATTRIBUTES.get(tag, set())
        serialized: list[str] = []
        seen: set[str] = set()
        for raw_name, raw_value in attrs:
            name = raw_name.lower()
            if tag == "img" and name in {"img_src", "data-src", "data-original", "data-mce-src"}:
                name = "src"
            if name not in allowed or name in seen or raw_value is None:
                continue
            value = str(raw_value).strip()
            data_image = re.fullmatch(
                r"data:image/(png|x-png|jpeg|jpg|gif|webp);base64,(.*)",
                value,
                flags=re.IGNORECASE | re.DOTALL,
            ) if tag == "img" and name == "src" else None
            if data_image:
                mime = data_image.group(1).lower()
                mime = "png" if mime == "x-png" else "jpeg" if mime == "jpg" else mime
                payload = data_image.group(2)
                payload = re.sub(r"\s+", "", payload)
                value = f"data:image/{mime};base64,{payload}"
            if not self._safe_url(tag, name, value):
                continue
            if name in {"height", "width", "colspan", "rowspan", "span"} and not re.fullmatch(r"\d{1,4}", value):
                continue
            if name == "target" and value not in {"_blank", "_self"}:
                continue
            if name == "rel":
                value = "noopener noreferrer"
            seen.add(name)
            serialized.append(f' {name}="{html.escape(value, quote=True)}"')
        return "".join(serialized)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in DANGEROUS_LEGACY_HTML_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth or tag not in ALLOWED_LEGACY_HTML_TAGS:
            return
        serialized_attrs = self._attributes(tag, attrs)
        if tag == "img" and ' src="' not in serialized_attrs:
            return
        self.parts.append(f"<{tag}{serialized_attrs}>")
        if tag not in VOID_LEGACY_HTML_TAGS:
            self.open_tags.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self.skip_depth or tag in DANGEROUS_LEGACY_HTML_TAGS or tag not in ALLOWED_LEGACY_HTML_TAGS:
            return
        serialized_attrs = self._attributes(tag, attrs)
        if tag == "img" and ' src="' not in serialized_attrs:
            return
        self.parts.append(f"<{tag}{serialized_attrs}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in DANGEROUS_LEGACY_HTML_TAGS:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth or tag not in self.open_tags:
            return
        last_index = len(self.open_tags) - 1 - self.open_tags[::-1].index(tag)
        for closing_tag in reversed(self.open_tags[last_index:]):
            self.parts.append(f"</{closing_tag}>")
        del self.open_tags[last_index:]

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0:
            self.parts.append(html.escape(data, quote=False))

    def html(self) -> str:
        for tag in reversed(self.open_tags):
            self.parts.append(f"</{tag}>")
        self.open_tags.clear()
        return "".join(self.parts).strip()


@dataclass(frozen=True)
class MessageRow:
    source_field: str
    body_html: str
    body_text: str
    author_user_id: str
    author_display_name: str
    created_at: datetime


@dataclass(frozen=True)
class QuestionRow:
    source_index: int
    legacy_no: str | None
    legacy_id: str
    title: str
    body_html: str
    body_text: str
    category: str
    line_name: str
    status: str
    author_user_id: str
    author_display_name: str
    created_at: datetime
    updated_at: datetime
    messages: tuple[MessageRow, ...]


@dataclass
class MigrationReport:
    mode: str
    source_file: str
    status: str = "started"
    failure: str | None = None
    root_key: str = ROOT_KEY
    generated_at: str = field(default_factory=lambda: datetime.now().astimezone().isoformat(timespec="seconds"))
    source_rows: int = 0
    valid_questions: int = 0
    valid_messages: int = 0
    inserted_questions: int = 0
    inserted_messages: int = 0
    warning_counts: dict[str, int] = field(default_factory=dict)
    warnings: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)
    id_mapping: list[dict[str, Any]] = field(default_factory=list)
    target: dict[str, Any] = field(default_factory=dict)
    assumptions: list[str] = field(default_factory=lambda: [
        "req_comment를 질문 body_html/body_text로 저장",
        "표와 Base64 그림 HTML은 보존하고 실행 가능한 태그·속성은 제거",
        "ans_comment, add_comment를 시간순 메시지 2개로 저장",
        "두 메시지는 원본 구조상 ans_knoxid/ansname/ansdate를 공통 사용",
        "17자리 원본 id는 문자열로 보존하고 DB question_id는 자동 발급",
        "원본 id와 신규 question_id 매핑은 이 보고서의 id_mapping에 기록",
        "원본 no는 DB에 저장하지 않음",
        "과거 알림, 변경 이력, 태그는 생성하지 않음",
        "완료 상태여도 명시적인 최종 답변 정보가 없어 final_message_id는 NULL",
    ])

    def add_warning(self, code: str, source_index: int, legacy_id: str | None, field_name: str) -> None:
        self.warnings.append({
            "code": code,
            "source_index": source_index,
            "legacy_id": legacy_id,
            "field": field_name,
        })

    def add_error(self, source_index: int, legacy_id: str | None, field_name: str, reason: str) -> None:
        self.errors.append({
            "source_index": source_index,
            "legacy_id": legacy_id,
            "field": field_name,
            "reason": reason,
        })

    def finish(self) -> None:
        self.warning_counts = dict(sorted(Counter(item["code"] for item in self.warnings).items()))


def normalize_nfkc(value: Any) -> str:
    if value is None:
        return ""
    return unicodedata.normalize("NFKC", str(value)).strip()


def require_text(value: Any, field_name: str, max_length: int) -> str:
    text = normalize_nfkc(value)
    if not text:
        raise MigrationError(f"필수값이 없습니다: {field_name}")
    if len(text) > max_length:
        raise MigrationError(f"{field_name} 값이 {max_length}자를 초과합니다")
    return text


def optional_text(value: Any) -> str:
    return normalize_nfkc(value)


def parse_legacy_id(value: Any) -> str:
    if isinstance(value, bool):
        raise MigrationError("id는 양의 정수여야 합니다")
    text = normalize_nfkc(value)
    if not re.fullmatch(r"[1-9]\d*", text):
        raise MigrationError("id는 양의 정수여야 합니다")
    if len(text) > 100:
        raise MigrationError("id 값이 100자를 초과합니다")
    return text


def parse_datetime(value: Any, field_name: str) -> datetime:
    text = normalize_nfkc(value)
    if not text:
        raise MigrationError(f"필수 날짜가 없습니다: {field_name}")
    normalized = text.replace("Z", "+00:00") if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        parsed = None
        for fmt in ("%Y%m%d%H%M%S", "%Y%m%d", "%Y.%m.%d %H:%M:%S", "%Y.%m.%d", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d"):
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
        if parsed is None:
            raise MigrationError(f"날짜 형식을 해석할 수 없습니다: {field_name}")
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone().replace(tzinfo=None)
    if parsed.year < 1900 or parsed.year > 9999:
        raise MigrationError(f"날짜 범위가 올바르지 않습니다: {field_name}")
    return parsed


def legacy_plain_text(value: Any) -> str:
    raw = "" if value is None else str(value)
    extractor = _PlainTextExtractor()
    try:
        extractor.feed(raw)
        extractor.close()
        text = extractor.text()
    except Exception:
        text = raw
    text = html.unescape(text).replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[\t \f\v]+", " ", line).strip() for line in text.split("\n")]
    collapsed: list[str] = []
    for line in lines:
        if line or (collapsed and collapsed[-1]):
            collapsed.append(line)
    return "\n".join(collapsed).strip()


def safe_html_from_text(text: str) -> str:
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    if not paragraphs:
        return ""
    return "".join(f"<p>{html.escape(part).replace(chr(10), '<br>')}</p>" for part in paragraphs)


def sanitize_legacy_html(value: Any) -> str:
    """기존 HTML의 표·그림·기본 서식은 보존하고 위험 요소는 제거한다."""
    raw = "" if value is None else str(value).strip()
    if not raw:
        return ""
    if not re.search(r"<\s*[a-zA-Z][^>]*>", raw):
        return safe_html_from_text(legacy_plain_text(raw))
    parser = _SafeLegacyHtmlParser()
    try:
        parser.feed(raw)
        parser.close()
    except Exception as error:
        raise MigrationError("기존 HTML 형식을 해석할 수 없습니다") from error
    sanitized = parser.html()
    if len(sanitized.encode("utf-8")) > MAX_MEDIUMTEXT_BYTES:
        raise MigrationError("HTML 본문이 MEDIUMTEXT 최대 크기를 초과합니다")
    return sanitized


def normalize_category(value: Any, report: MigrationReport, index: int, legacy_id: str) -> str:
    raw = normalize_nfkc(value)
    category = CATEGORY_ALIASES.get(raw.casefold())
    if category:
        return category
    report.add_warning("category_defaulted", index, legacy_id, "group2")
    return "미분류"


def normalize_line_name(value: Any, report: MigrationReport, index: int, legacy_id: str) -> str:
    line_name = normalize_nfkc(value)
    if not line_name:
        report.add_warning("line_defaulted", index, legacy_id, "line")
        return "미지정"
    if len(line_name) > 100:
        raise MigrationError("line 값이 100자를 초과합니다")
    return line_name


def resolve_author(
    user_value: Any,
    name_value: Any,
    *,
    fallback_user_id: str,
    fallback_display_name: str,
    user_field: str,
    name_field: str,
    report: MigrationReport,
    index: int,
    legacy_id: str,
) -> tuple[str, str]:
    user_id = normalize_nfkc(user_value)
    display_name = normalize_nfkc(name_value)
    if not user_id:
        user_id = fallback_user_id
        report.add_warning("author_user_id_defaulted", index, legacy_id, user_field)
    if not display_name:
        display_name = fallback_display_name
        report.add_warning("author_display_name_defaulted", index, legacy_id, name_field)
    if len(user_id) > 100:
        raise MigrationError(f"{user_field} 값이 100자를 초과합니다")
    if len(display_name) > 100:
        raise MigrationError(f"{name_field} 값이 100자를 초과합니다")
    return user_id, display_name


def normalize_status(value: Any, has_messages: bool, report: MigrationReport, index: int, legacy_id: str) -> str:
    raw = normalize_nfkc(value)
    status = STATUS_ALIASES.get(raw.casefold())
    if status is None:
        report.add_warning("status_derived", index, legacy_id, "status2")
        return "active" if has_messages else "waiting"
    if status == "waiting" and has_messages:
        report.add_warning("status_waiting_changed_to_active", index, legacy_id, "status2")
        return "active"
    if status == "active" and not has_messages:
        report.add_warning("status_active_without_message", index, legacy_id, "status2")
    return status


def transform_record(record: Any, index: int, report: MigrationReport) -> QuestionRow:
    if not isinstance(record, dict):
        raise MigrationError("각 목록 항목은 JSON 객체여야 합니다")
    legacy_id = parse_legacy_id(record.get("id"))
    title = require_text(record.get("title"), "title", 255)
    question_body = legacy_plain_text(record.get("req_comment"))
    if not question_body:
        raise MigrationError("필수값이 없습니다: req_comment")
    if len(question_body) > 500_000:
        raise MigrationError("req_comment 값이 500000자를 초과합니다")
    question_created_at = parse_datetime(record.get("reqdate"), "reqdate")
    question_author = resolve_author(
        record.get("req_knoxid"),
        record.get("reqname"),
        fallback_user_id="legacy-question-author-unknown",
        fallback_display_name="이전 게시판 질문자 미상",
        user_field="req_knoxid",
        name_field="reqname",
        report=report,
        index=index,
        legacy_id=legacy_id,
    )

    answer_values = [(field_name, label, legacy_plain_text(record.get(field_name))) for field_name, label in MESSAGE_FIELDS]
    answer_values = [(field_name, label, text) for field_name, label, text in answer_values if text]
    messages: list[MessageRow] = []
    if answer_values:
        answer_author = resolve_author(
            record.get("ans_knoxid"),
            record.get("ansname"),
            fallback_user_id="legacy-answer-author-unknown",
            fallback_display_name="이전 게시판 답변자 미상",
            user_field="ans_knoxid",
            name_field="ansname",
            report=report,
            index=index,
            legacy_id=legacy_id,
        )
        answer_created_at = parse_datetime(record.get("ansdate"), "ansdate")
        for field_name, _label, body_text in answer_values:
            if len(body_text) > 500_000:
                raise MigrationError(f"{field_name} 값이 500000자를 초과합니다")
            messages.append(MessageRow(
                source_field=field_name,
                body_html=sanitize_legacy_html(record.get(field_name)),
                body_text=re.sub(r"\s+", " ", body_text).strip(),
                author_user_id=answer_author[0],
                author_display_name=answer_author[1],
                created_at=answer_created_at,
            ))

    status = normalize_status(record.get("status2"), bool(messages), report, index, legacy_id)
    updated_at = max([question_created_at, *(message.created_at for message in messages)])
    question_body_text = re.sub(r"\s+", " ", question_body).strip()
    return QuestionRow(
        source_index=index,
        legacy_no=optional_text(record.get("no")) or None,
        legacy_id=legacy_id,
        title=title,
        body_html=sanitize_legacy_html(record.get("req_comment")),
        body_text=question_body_text,
        category=normalize_category(record.get("group2"), report, index, legacy_id),
        line_name=normalize_line_name(record.get("line"), report, index, legacy_id),
        status=status,
        author_user_id=question_author[0],
        author_display_name=question_author[1],
        created_at=question_created_at,
        updated_at=updated_at,
        messages=tuple(messages),
    )


def load_and_transform(path: Path, report: MigrationReport) -> list[QuestionRow]:
    try:
        with path.open("r", encoding="utf-8-sig") as source:
            payload = json.load(source)
    except FileNotFoundError as error:
        raise MigrationError(f"JSON 파일을 찾을 수 없습니다: {path}") from error
    except json.JSONDecodeError as error:
        raise MigrationError(f"JSON 형식이 올바르지 않습니다: {error.msg} (줄 {error.lineno}, 열 {error.colno})") from error
    except OSError as error:
        raise MigrationError(f"JSON 파일을 읽을 수 없습니다: {path}") from error

    if not isinstance(payload, dict):
        raise MigrationError("JSON 최상위 값은 객체여야 합니다")
    records = payload.get(ROOT_KEY)
    if not isinstance(records, list):
        raise MigrationError(f"최상위 '{ROOT_KEY}' 값은 배열이어야 합니다")
    report.source_rows = len(records)

    questions: list[QuestionRow] = []
    seen_ids: set[str] = set()
    seen_legacy_numbers: set[str] = set()
    for index, record in enumerate(records):
        legacy_id: str | None = None
        try:
            if isinstance(record, dict):
                try:
                    legacy_id = parse_legacy_id(record.get("id"))
                except MigrationError:
                    pass
            question = transform_record(record, index, report)
            legacy_id = question.legacy_id
            if question.legacy_id in seen_ids:
                raise MigrationError("중복된 id입니다")
            seen_ids.add(question.legacy_id)
            if question.legacy_no:
                if question.legacy_no in seen_legacy_numbers:
                    report.add_warning("duplicate_legacy_no", index, question.legacy_id, "no")
                seen_legacy_numbers.add(question.legacy_no)
            questions.append(question)
        except MigrationError as error:
            field_name = _guess_error_field(str(error))
            report.add_error(index, legacy_id, field_name, str(error))

    report.valid_questions = len(questions)
    report.valid_messages = sum(len(question.messages) for question in questions)
    report.finish()
    return questions


def _guess_error_field(message: str) -> str:
    for field_name in ("id", "title", "reqdate", "ansdate", "req_knoxid", "reqname", "ans_knoxid", "ansname", "group2", "line", "status2", "req_comment", "ans_comment", "add_comment"):
        if field_name in message:
            return field_name
    return "record"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def db_config(env_file: Path) -> dict[str, Any]:
    load_env_file(env_file)
    required = ("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise MigrationError(f"DB 환경변수가 필요합니다: {', '.join(missing)}")
    port_text = os.environ.get("DB_PORT", "3306")
    try:
        port = int(port_text)
    except ValueError as error:
        raise MigrationError("DB_PORT는 정수여야 합니다") from error
    if port < 1 or port > 65_535:
        raise MigrationError("DB_PORT는 1~65535 범위여야 합니다")
    return {
        "host": os.environ["DB_HOST"],
        "port": port,
        "user": os.environ["DB_USER"],
        "password": os.environ["DB_PASSWORD"],
        "database": os.environ["DB_NAME"],
        "charset": "utf8mb4",
    }


def connect_database(config: dict[str, Any]) -> tuple[Any, str]:
    try:
        import mysql.connector  # type: ignore[import-not-found]

        connection = mysql.connector.connect(**config, autocommit=False)
        return connection, "mysql-connector-python"
    except ImportError:
        pass
    try:
        import pymysql  # type: ignore[import-not-found]

        connection = pymysql.connect(**config, autocommit=False)
        return connection, "PyMySQL"
    except ImportError as error:
        raise MigrationError("DB 드라이버가 없습니다. 'pip install mysql-connector-python' 또는 'pip install PyMySQL'을 실행하세요") from error


def execute_one(cursor: Any, sql: str, parameters: Sequence[Any] = ()) -> Any:
    cursor.execute(sql, parameters)
    return cursor.fetchone()


def inspect_database(connection: Any, report: MigrationReport) -> dict[str, int]:
    cursor = connection.cursor()
    try:
        database_row = execute_one(cursor, "SELECT DATABASE(), VERSION()")
        if not database_row or not database_row[0]:
            raise MigrationError("선택된 DB가 없습니다")
        actual_database, version = str(database_row[0]), str(database_row[1])
        table_counts: dict[str, int] = {}
        for table_name, required_columns in REQUIRED_COLUMNS.items():
            cursor.execute(
                "SELECT COLUMN_NAME FROM information_schema.columns "
                "WHERE table_schema = DATABASE() AND table_name = %s",
                (table_name,),
            )
            actual_columns = {str(row[0]) for row in cursor.fetchall()}
            if not actual_columns:
                raise MigrationError(f"대상 테이블이 없습니다: {table_name}")
            missing_columns = sorted(required_columns - actual_columns)
            if missing_columns:
                raise MigrationError(f"{table_name}에 필수 컬럼이 없습니다: {', '.join(missing_columns)}")
            cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
            table_counts[table_name] = int(cursor.fetchone()[0])
        report.target = {
            **report.target,
            "database": actual_database,
            "database_version": version,
            "table_counts_before": table_counts,
        }
        return table_counts
    finally:
        cursor.close()


QUESTION_INSERT_SQL = f"""
INSERT INTO `{QUESTION_TABLE}` (
  title, body_html, body_text, category, line_name, status,
  author_user_id, author_display_name, final_message_id, view_count,
  created_at, updated_at, hidden_at, hidden_by_user_id
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, 0, %s, %s, NULL, NULL)
"""

MESSAGE_INSERT_SQL = f"""
INSERT INTO `{MESSAGE_TABLE}` (
  question_id, body_html, body_text, author_user_id, author_display_name,
  created_at, updated_at, hidden_at, hidden_by_user_id
) VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, NULL)
"""


def apply_migration(connection: Any, questions: Sequence[QuestionRow], report: MigrationReport, allow_nonempty: bool) -> None:
    table_counts = inspect_database(connection, report)
    if not allow_nonempty and any(table_counts.values()):
        raise MigrationError(
            "대상 질문/메시지 테이블이 비어 있지 않아 중단했습니다. 기존 데이터와 함께 넣어야 한다면 "
            "백업과 중복 위험을 확인한 뒤 --allow-nonempty를 명시하세요"
        )
    cursor = connection.cursor()
    inserted_questions = 0
    inserted_messages = 0
    generated_question_ids: list[int] = []
    try:
        for question in questions:
            cursor.execute(QUESTION_INSERT_SQL, (
                question.title,
                question.body_html,
                question.body_text,
                question.category,
                question.line_name,
                question.status,
                question.author_user_id,
                question.author_display_name,
                question.created_at,
                question.updated_at,
            ))
            new_question_id = int(cursor.lastrowid)
            if new_question_id <= 0 or new_question_id > MAX_SAFE_JAVASCRIPT_INTEGER:
                raise MigrationError("DB가 웹 화면에서 안전하게 처리할 수 없는 question_id를 발급했습니다")
            generated_question_ids.append(new_question_id)
            report.id_mapping.append({
                "legacy_id": question.legacy_id,
                "question_id": new_question_id,
            })
            inserted_questions += 1
            for message in question.messages:
                cursor.execute(MESSAGE_INSERT_SQL, (
                    new_question_id,
                    message.body_html,
                    message.body_text,
                    message.author_user_id,
                    message.author_display_name,
                    message.created_at,
                    message.created_at,
                ))
                inserted_messages += 1

        cursor.execute(f"SELECT COUNT(*) FROM `{QUESTION_TABLE}` WHERE question_id IN ({','.join(['%s'] * len(generated_question_ids))})", tuple(generated_question_ids))
        verified_questions = int(cursor.fetchone()[0])
        if verified_questions != len(questions):
            raise MigrationError("트랜잭션 내 질문 건수 검증에 실패했습니다")
        cursor.execute(
            f"SELECT COUNT(*) FROM `{MESSAGE_TABLE}` WHERE question_id IN ({','.join(['%s'] * len(generated_question_ids))})",
            tuple(generated_question_ids),
        )
        verified_messages = int(cursor.fetchone()[0])
        expected_existing_messages = 0
        if allow_nonempty:
            # DB가 새로 발급한 질문 ID이므로 기존 메시지는 없어야 한다.
            expected_existing_messages = 0
        if verified_messages != inserted_messages + expected_existing_messages:
            raise MigrationError("트랜잭션 내 메시지 건수 검증에 실패했습니다")
        connection.commit()
        report.inserted_questions = inserted_questions
        report.inserted_messages = inserted_messages
        report.target["table_counts_after"] = {
            QUESTION_TABLE: table_counts[QUESTION_TABLE] + inserted_questions,
            MESSAGE_TABLE: table_counts[MESSAGE_TABLE] + inserted_messages,
        }
    except Exception:
        connection.rollback()
        report.id_mapping.clear()
        raise
    finally:
        cursor.close()


def write_report(path: Path, report: MigrationReport) -> None:
    report.finish()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(report), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="이전 게시판 JSON을 Quality Hub Q&A DB 형식으로 검증·이관합니다.")
    parser.add_argument("json_file", type=Path, help="이전 게시판 JSON 파일")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check-db", action="store_true", help="JSON과 DB 스키마·현재 건수만 확인하고 변경하지 않음")
    mode.add_argument("--apply", action="store_true", help="한 트랜잭션으로 실제 DB에 적재")
    parser.add_argument("--confirm-db", metavar="DB_NAME", help="--apply 시 오입력 방지를 위해 대상 DB명을 다시 지정")
    parser.add_argument("--allow-nonempty", action="store_true", help="기존 질문/메시지가 있는 DB에 추가 적재 허용")
    parser.add_argument("--env-file", type=Path, default=Path(".env.db"), help="DB 환경파일 경로 (기본값: .env.db)")
    parser.add_argument("--report", type=Path, help="보고서 JSON 경로 (기본값: 입력 파일 옆 *.migration-report.json)")
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report_path = args.report or args.json_file.with_name(f"{args.json_file.stem}.migration-report.json")
    mode = "apply" if args.apply else "check-db" if args.check_db else "validate"
    report = MigrationReport(mode=mode, source_file=str(args.json_file.resolve()))
    connection = None
    exit_code = 0
    try:
        if args.allow_nonempty and not args.apply:
            raise MigrationError("--allow-nonempty는 --apply와 함께만 사용할 수 있습니다")
        if args.confirm_db and not args.apply:
            raise MigrationError("--confirm-db는 --apply와 함께만 사용할 수 있습니다")
        questions = load_and_transform(args.json_file, report)
        if report.errors:
            raise MigrationError(f"{len(report.errors)}개 행의 검증 오류가 있어 DB 작업을 중단했습니다")
        if not questions:
            raise MigrationError("이관할 유효한 질문이 없습니다")
        print(f"JSON 검증 완료: 질문 {len(questions)}건, 메시지 {report.valid_messages}건, 경고 {len(report.warnings)}건")
        report.status = "validated"

        if args.check_db or args.apply:
            config = db_config(args.env_file)
            if args.apply and args.confirm_db != config["database"]:
                raise MigrationError("--confirm-db 값이 DB_NAME과 일치해야 실제 적재할 수 있습니다")
            connection, driver = connect_database(config)
            report.target["driver"] = driver
            if args.apply:
                apply_migration(connection, questions, report, args.allow_nonempty)
                report.status = "completed"
                print(f"DB 적재 완료: 질문 {report.inserted_questions}건, 메시지 {report.inserted_messages}건")
            else:
                counts = inspect_database(connection, report)
                report.status = "db_checked"
                print(f"DB 확인 완료: 기존 질문 {counts[QUESTION_TABLE]}건, 기존 메시지 {counts[MESSAGE_TABLE]}건")
        else:
            print("DB는 연결하거나 변경하지 않았습니다. 다음 단계는 --check-db입니다.")
    except MigrationError as error:
        report.status = "failed"
        report.failure = str(error)
        print(f"오류: {error}", file=sys.stderr)
        exit_code = 2
    except Exception as error:
        error_code = getattr(error, "errno", None) or getattr(error, "args", [None])[0]
        safe_code = f" (DB 오류 코드: {error_code})" if isinstance(error_code, int) else ""
        report.status = "failed"
        report.failure = "database_or_runtime_error"
        if isinstance(error_code, int):
            report.target["error_code"] = error_code
        print(f"오류: 이관 작업에 실패했습니다{safe_code}. 트랜잭션은 롤백했습니다.", file=sys.stderr)
        exit_code = 3
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass
        write_report(report_path, report)
        print(f"보고서: {report_path}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
