from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any


class Status(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARN = "WARN"
    SKIP = "SKIP"
    ERROR = "ERROR"

    def __str__(self) -> str:
        return self.value


@dataclass(slots=True)
class Finding:
    check_id: str
    title: str
    status: Status
    summary: str
    category: str
    severity: str = "정보"
    evidence: dict[str, Any] = field(default_factory=dict)
    duration_seconds: float = 0.0
    log_path: str | None = None

    def as_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["status"] = self.status.value
        return payload


@dataclass(slots=True)
class AuditContext:
    repo_root: Path
    output_dir: Path
    work_dir: Path
    logs_dir: Path
    screenshots_dir: Path
    selected_cpus: tuple[int, ...]
    requested_cpu_budget: float
    command_timeout: int
    browser_timeout: int
    include_network: bool
    skip_browser: bool
    keep_work: bool
    forced_cpu_floor: float | None = None
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)

    def relative(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.output_dir))
        except ValueError:
            return str(path)


@dataclass(slots=True)
class AuditReport:
    context: AuditContext
    findings: list[Finding] = field(default_factory=list)
    finished_at: datetime | None = None

    def add(self, finding: Finding) -> None:
        self.findings.append(finding)

    @property
    def counts(self) -> dict[str, int]:
        return {
            status.value: sum(finding.status == status for finding in self.findings)
            for status in Status
        }

    @property
    def exit_code(self) -> int:
        return 1 if any(item.status in {Status.FAIL, Status.ERROR} for item in self.findings) else 0
