from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable

from .model import AuditContext, Finding, Status
from .process import CommandCheck, run_command_checks


EXCLUDED_PARTS = {".git", "node_modules", "dist", "coverage", "results", "__pycache__"}
TEXT_SUFFIXES = {".css", ".html", ".js", ".jsx", ".json", ".md", ".mjs", ".py", ".toml", ".yml", ".yaml"}
SECRET_PATTERNS = {
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "aws-access-key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "github-token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,255}\b"),
    "generic-secret": re.compile(r"(?i)\b(?:api[_-]?key|client[_-]?secret|password|token)\b\s*[:=]\s*['\"][^'\"\n]{12,}['\"]"),
}
RISK_PATTERNS = {
    "dangerouslySetInnerHTML": re.compile(r"\bdangerouslySetInnerHTML\b"),
    "innerHTML assignment": re.compile(r"\.innerHTML\s*="),
    "eval": re.compile(r"\beval\s*\("),
    "Function constructor": re.compile(r"\bnew\s+Function\s*\("),
    "document.write": re.compile(r"\bdocument\.write\s*\("),
    "wildcard postMessage": re.compile(r"\.postMessage\s*\([^,]+,\s*['\"]\*['\"]"),
    "non-TLS absolute URL": re.compile(r"http://(?!127\.0\.0\.1|localhost|0\.0\.0\.0)[^\s'\"<>]+"),
}


def iter_source_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if any(part in EXCLUDED_PARTS for part in path.relative_to(root).parts):
            continue
        yield path


class MarkupInspector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.controls: list[dict[str, str]] = []
        self.images_without_alt: list[int] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        if values.get("id"):
            self.ids.append(values["id"])
        if tag in {"button", "input", "select", "textarea"}:
            self.controls.append({"tag": tag, **values})
        if tag == "img" and "alt" not in values:
            self.images_without_alt.append(self.getpos()[0])


def source_inventory(context: AuditContext) -> Finding:
    started = time.monotonic()
    rows = []
    total_lines = 0
    total_bytes = 0
    for path in iter_source_files(context.repo_root):
        data = path.read_bytes()
        lines = data.count(b"\n") + (1 if data else 0)
        total_lines += lines
        total_bytes += len(data)
        rows.append({
            "path": str(path.relative_to(context.repo_root)),
            "lines": lines,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        })
    rows.sort(key=lambda row: row["bytes"], reverse=True)
    inventory_path = context.output_dir / "source-inventory.json"
    inventory_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return Finding(
        "STATIC-01",
        "소스 인벤토리",
        Status.PASS,
        f"검수 대상 {len(rows)}개 파일, {total_lines:,}줄을 기록했습니다.",
        "정적·구조 검사",
        evidence={"files": len(rows), "lines": total_lines, "bytes": total_bytes, "largest": rows[:15]},
        duration_seconds=time.monotonic() - started,
        log_path=context.relative(inventory_path),
    )


def secret_scan(context: AuditContext) -> Finding:
    started = time.monotonic()
    matches: list[dict[str, object]] = []
    for path in iter_source_files(context.repo_root):
        if path.is_relative_to(context.repo_root / "tools" / "quality_audit"):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for line_number, line in enumerate(text.splitlines(), 1):
            for name, pattern in SECRET_PATTERNS.items():
                if pattern.search(line):
                    matches.append({"type": name, "path": str(path.relative_to(context.repo_root)), "line": line_number})
    status = Status.FAIL if matches else Status.PASS
    return Finding(
        "SEC-01",
        "비밀정보 패턴 검사",
        status,
        f"의심 패턴 {len(matches)}건을 찾았습니다." if matches else "일반적인 비밀정보 패턴을 찾지 못했습니다.",
        "보안 검사",
        severity="높음",
        evidence={"matches": matches},
        duration_seconds=time.monotonic() - started,
    )


def risky_api_scan(context: AuditContext) -> Finding:
    started = time.monotonic()
    matches: list[dict[str, object]] = []
    for path in iter_source_files(context.repo_root):
        if path.is_relative_to(context.repo_root / "tools" / "quality_audit"):
            continue
        if path.suffix.lower() not in {".html", ".js", ".jsx", ".mjs"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for line_number, line in enumerate(text.splitlines(), 1):
            for name, pattern in RISK_PATTERNS.items():
                if pattern.search(line):
                    matches.append({"type": name, "path": str(path.relative_to(context.repo_root)), "line": line_number, "snippet": line.strip()[:240]})
    # 위험 API는 사용 자체가 취약점이라는 뜻이 아니므로 검토 필요 항목으로 남긴다.
    status = Status.WARN if matches else Status.PASS
    return Finding(
        "SEC-02",
        "위험 API·URL 사용 검사",
        status,
        f"수동 검토 대상 {len(matches)}건입니다." if matches else "지정한 위험 API 패턴이 없습니다.",
        "보안 검사",
        severity="중간",
        evidence={"matches": matches},
        duration_seconds=time.monotonic() - started,
    )


def markup_contract(context: AuditContext) -> Finding:
    started = time.monotonic()
    html_path = context.repo_root / "prototype" / "index.html"
    inspector = MarkupInspector()
    inspector.feed(html_path.read_text(encoding="utf-8"))
    duplicate_ids = sorted(value for value, count in Counter(inspector.ids).items() if count > 1)
    unlabeled_controls = []
    for control in inspector.controls:
        if control["tag"] == "input" and control.get("type") == "hidden":
            continue
        has_name_hint = any(control.get(key) for key in ("aria-label", "aria-labelledby", "title", "placeholder", "id"))
        if not has_name_hint:
            unlabeled_controls.append({key: value for key, value in control.items() if key in {"tag", "type", "class", "data-testid"}})
    failures = len(duplicate_ids) + len(inspector.images_without_alt)
    status = Status.FAIL if failures else (Status.WARN if unlabeled_controls else Status.PASS)
    summary = f"중복 ID {len(duplicate_ids)}건, alt 누락 이미지 {len(inspector.images_without_alt)}건, 이름 수동 확인 대상 컨트롤 {len(unlabeled_controls)}건입니다."
    return Finding(
        "A11Y-STATIC-01",
        "HTML 구조·접근성 기초 계약",
        status,
        summary,
        "접근성 검사",
        severity="높음" if failures else "중간",
        evidence={"duplicate_ids": duplicate_ids, "images_without_alt_lines": inspector.images_without_alt, "controls_to_review": unlabeled_controls[:100]},
        duration_seconds=time.monotonic() - started,
    )


def documentation_boundary(context: AuditContext) -> Finding:
    started = time.monotonic()
    required = {
        "AGENTS.md": ["모든 프로젝트 문서와 보고서는 한국어", "Git 커밋, 푸시, PR 생성과 병합은 사용자가 수행"],
        "docs/QUALITY_PORTAL_REQUIREMENTS.md": ["실제 SSO", "예시 데이터 기반 목업", "약 50명"],
        "docs/DEVELOPMENT_PLAN.md": ["3단계", "실제 사내 시스템 연동", "검증 및 공개 준비"],
        "docs/PHASE2_COMPLETION_REPORT.md": ["실제 연동", "미검증"],
    }
    missing: list[dict[str, str]] = []
    for relative, phrases in required.items():
        path = context.repo_root / relative
        if not path.exists():
            missing.append({"path": relative, "missing": "파일"})
            continue
        text = path.read_text(encoding="utf-8")
        for phrase in phrases:
            if phrase not in text:
                missing.append({"path": relative, "missing": phrase})
    status = Status.FAIL if missing else Status.PASS
    return Finding(
        "DOC-01",
        "목업·운영 경계 문서 계약",
        status,
        f"누락 {len(missing)}건입니다." if missing else "목업과 실제 연동·운영 검증 경계가 문서에 유지됩니다.",
        "문서·범위 검사",
        severity="높음",
        evidence={"missing": missing},
        duration_seconds=time.monotonic() - started,
    )


def standard_command_checks(context: AuditContext) -> list[Finding]:
    tests = sorted(str(path) for path in (context.repo_root / "tests").glob("*.test.mjs"))
    vite_bin = context.repo_root / "node_modules" / ".bin" / "vite"
    vitest_bin = context.repo_root / "node_modules" / ".bin" / "vitest"
    build_dir = context.work_dir / "build"
    lint_finding: Finding | None = None
    network_finding: Finding | None = None
    checks = [
        CommandCheck(
            check_id="CODE-01",
            title="Git 공백·충돌 표식 검사",
            category="자동 테스트·빌드",
            args=("git", "diff", "--check"),
            timeout=60,
            success_summary="Git diff 형식 검사를 통과했습니다.",
        ),
        CommandCheck(
            check_id="CODE-02",
            title="Node 실행 파일 구문 검사",
            category="자동 테스트·빌드",
            args=("node", "--check", str(context.repo_root / "server.mjs")),
            timeout=60,
            success_summary="server.mjs 구문 검사를 통과했습니다.",
        ),
        CommandCheck(
            check_id="CODE-03",
            title="브라우저 앱 모듈 구문 검사",
            category="자동 테스트·빌드",
            args=("node", "--check", str(context.repo_root / "prototype" / "app.js")),
            timeout=60,
            success_summary="prototype/app.js 구문 검사를 통과했습니다.",
        ),
        CommandCheck(
            check_id="SELF-01",
            title="Python 검수기 자체 단위 테스트",
            category="자동 테스트·빌드",
            args=(sys.executable, "-m", "unittest", "discover", "-s", str(context.repo_root / "tools" / "quality_audit" / "tests"), "-v"),
            timeout=120,
            extra_env={"PYTHONPATH": str(context.repo_root / "tools" / "quality_audit")},
            success_summary="검수기 자체 단위 테스트를 통과했습니다.",
        ),
        CommandCheck(
            check_id="DEPS-01",
            title="설치 의존성 트리 검사",
            category="자동 테스트·빌드",
            args=("npm", "ls", "--depth=0", "--json"),
            timeout=120,
            success_summary="설치된 최상위 의존성 트리가 일관됩니다.",
        ),
        CommandCheck(
            check_id="TEST-01",
            title="Node 계약·서버 테스트",
            category="자동 테스트·빌드",
            args=("node", "--test", *tests),
            timeout=max(context.command_timeout, 300),
            success_summary="Node 계약·서버 테스트를 통과했습니다.",
            priority=20,
        ),
        CommandCheck(
            check_id="TEST-02",
            title="Vitest React 컴포넌트 테스트",
            category="자동 테스트·빌드",
            args=(str(vitest_bin), "run", "--reporter=verbose"),
            timeout=max(context.command_timeout, 300),
            cwd=context.repo_root,
            success_summary="React 컴포넌트 테스트를 통과했습니다.",
            priority=10,
        ),
        CommandCheck(
            check_id="BUILD-01",
            title="분리된 Vite 프로덕션 빌드",
            category="자동 테스트·빌드",
            args=(str(vite_bin), "build", "--outDir", str(build_dir), "--emptyOutDir"),
            timeout=max(context.command_timeout, 300),
            success_summary="추적 파일을 덮어쓰지 않는 별도 결과 폴더에 빌드했습니다.",
            priority=5,
        ),
    ]
    package = json.loads((context.repo_root / "package.json").read_text(encoding="utf-8"))
    scripts = package.get("scripts", {})
    if "lint" in scripts:
        checks.append(CommandCheck(
            check_id="LINT-01",
            title="프로젝트 lint",
            category="자동 테스트·빌드",
            args=("npm", "run", "lint"),
            timeout=max(context.command_timeout, 300),
            success_summary="프로젝트 lint를 통과했습니다.",
            priority=20,
        ))
    else:
        lint_finding = Finding(
            "LINT-01",
            "프로젝트 lint",
            Status.SKIP,
            "package.json에 lint 스크립트가 없어 미실행했습니다.",
            "자동 테스트·빌드",
            severity="미검증",
        )
    context.metadata["build_dir"] = str(build_dir)
    if context.include_network:
        checks.append(CommandCheck(
            check_id="SEC-03",
            title="npm 의존성 취약점 조회",
            category="보안 검사",
            args=("npm", "audit", "--json"),
            timeout=max(context.command_timeout, 300),
            severity="높음",
            success_summary="npm 취약점 조회가 0 종료 코드로 완료됐습니다.",
            priority=30,
        ))
    else:
        network_finding = Finding(
            "SEC-03",
            "npm 의존성 취약점 조회",
            Status.SKIP,
            "외부 레지스트리 접근을 피하기 위해 미실행했습니다. 필요하면 --include-network를 사용하세요.",
            "보안 검사",
            severity="미검증",
        )
    command_findings = run_command_checks(context, checks, max_workers=len(context.selected_cpus))
    context.metadata["command_workers"] = min(len(context.selected_cpus), len(checks))
    command_findings.extend(item for item in (lint_finding, network_finding) if item is not None)
    return command_findings


def bundle_size_check(context: AuditContext) -> Finding:
    started = time.monotonic()
    build_dir = Path(context.metadata.get("build_dir", context.work_dir / "build"))
    if not build_dir.exists():
        return Finding("BUILD-02", "빌드 산출물 크기", Status.SKIP, "빌드 산출물이 없어 크기를 측정하지 못했습니다.", "성능·안정성 검사", severity="미검증")
    rows = []
    for path in build_dir.rglob("*"):
        if path.is_file():
            rows.append({"path": str(path.relative_to(build_dir)), "bytes": path.stat().st_size})
    rows.sort(key=lambda row: row["bytes"], reverse=True)
    over_limit = [row for row in rows if row["bytes"] > 500 * 1024]
    status = Status.WARN if over_limit else Status.PASS
    return Finding(
        "BUILD-02",
        "빌드 산출물 크기",
        status,
        f"총 {sum(row['bytes'] for row in rows):,}바이트, 500KiB 초과 파일 {len(over_limit)}개입니다.",
        "성능·안정성 검사",
        severity="중간",
        evidence={"files": rows, "over_500_kib": over_limit},
        duration_seconds=time.monotonic() - started,
    )
