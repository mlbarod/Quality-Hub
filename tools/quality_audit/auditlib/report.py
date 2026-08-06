from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .model import AuditReport, Finding, Status


STATUS_KO = {
    Status.PASS: "통과",
    Status.FAIL: "실패",
    Status.WARN: "주의",
    Status.SKIP: "미실행",
    Status.ERROR: "오류",
}


def _json_safe(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def write_json(report: AuditReport) -> Path:
    path = report.context.output_dir / "report.json"
    payload = {
        "schema_version": 1,
        "started_at": report.context.started_at.isoformat(),
        "finished_at": (report.finished_at or datetime.now(timezone.utc)).isoformat(),
        "repo_root": str(report.context.repo_root),
        "requested_cpu_budget": report.context.requested_cpu_budget,
        "forced_cpu_floor": report.context.forced_cpu_floor,
        "selected_logical_cpus": report.context.selected_cpus,
        "metadata": report.context.metadata,
        "counts": report.counts,
        "exit_code": report.exit_code,
        "findings": [finding.as_dict() for finding in report.findings],
    }
    path.write_text(json.dumps(_json_safe(payload), ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _render_evidence(finding: Finding) -> str:
    if not finding.evidence:
        return ""
    serialized = json.dumps(_json_safe(finding.evidence), ensure_ascii=False, indent=2)
    return f"\n\n<details><summary>근거</summary>\n\n```json\n{serialized}\n```\n\n</details>"


def write_markdown(report: AuditReport) -> Path:
    path = report.context.output_dir / "report.md"
    counts = report.counts
    overall = "실패" if report.exit_code else ("주의 포함 통과" if counts[Status.WARN.value] else "통과")
    lines = [
        "# Quality Hub 전체 검수 보고서",
        "",
        f"- 전체 판정: `{overall}`",
        f"- 시작 시각(UTC): `{report.context.started_at.isoformat()}`",
        f"- 종료 시각(UTC): `{(report.finished_at or datetime.now(timezone.utc)).isoformat()}`",
        f"- CPU 요청값: `{report.context.requested_cpu_budget}` · affinity: `{', '.join(map(str, report.context.selected_cpus))}`",
        f"- 합성 CPU 하한: `{report.context.forced_cpu_floor if report.context.forced_cpu_floor is not None else '미사용'}`",
        f"- 결과 수: 통과 {counts['PASS']} · 실패 {counts['FAIL']} · 주의 {counts['WARN']} · 미실행 {counts['SKIP']} · 오류 {counts['ERROR']}",
        "",
        "> 이 결과는 로컬 목업과 현재 코드에 대한 검수입니다. 실제 SSO, Spotfire, 사내 LLM, DB, Parquet, 운영 보안·네트워크와 50명 동시 사용을 증명하지 않습니다.",
        "",
    ]
    categories: dict[str, list[Finding]] = {}
    for finding in report.findings:
        categories.setdefault(finding.category, []).append(finding)
    for category, findings in categories.items():
        lines.extend([f"## {category}", ""])
        for finding in findings:
            lines.extend([
                f"### {finding.check_id} · {finding.title}",
                "",
                f"- 판정: `{STATUS_KO[finding.status]}`",
                f"- 심각도: `{finding.severity}`",
                f"- 소요시간: `{finding.duration_seconds:.2f}초`",
                f"- 요약: {finding.summary}",
            ])
            if finding.log_path:
                lines.append(f"- 로그: `{finding.log_path}`")
            lines.append(_render_evidence(finding))
            lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
