from __future__ import annotations

import os
import shlex
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .model import AuditContext, Finding, Status
from .resources import child_environment


@dataclass(slots=True)
class CommandResult:
    args: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str
    duration_seconds: float
    timed_out: bool
    log_path: Path


@dataclass(frozen=True, slots=True)
class CommandCheck:
    check_id: str
    title: str
    category: str
    args: tuple[str, ...]
    timeout: int | None = None
    severity: str = "높음"
    success_summary: str = "명령이 정상 종료되었습니다."
    cwd: Path | None = None
    extra_env: dict[str, str] | None = None
    priority: int = 100


def command_exists(name: str) -> bool:
    from shutil import which

    return which(name) is not None


def run_command(
    context: AuditContext,
    check_id: str,
    args: Iterable[str],
    *,
    timeout: int | None = None,
    cwd: Path | None = None,
    extra_env: dict[str, str] | None = None,
) -> CommandResult:
    command = tuple(str(part) for part in args)
    log_path = context.logs_dir / f"{check_id}.log"
    env = child_environment(context.selected_cpus)
    if extra_env:
        env.update(extra_env)
    started = time.monotonic()
    timed_out = False
    try:
        completed = subprocess.run(
            command,
            cwd=cwd or context.repo_root,
            env=env,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=timeout or context.command_timeout,
            check=False,
        )
        returncode = completed.returncode
        stdout = completed.stdout
        stderr = completed.stderr
    except subprocess.TimeoutExpired as error:
        timed_out = True
        returncode = 124
        stdout = (error.stdout or "") if isinstance(error.stdout, str) else (error.stdout or b"").decode(errors="replace")
        stderr = (error.stderr or "") if isinstance(error.stderr, str) else (error.stderr or b"").decode(errors="replace")
        stderr += f"\n시간 제한 {timeout or context.command_timeout}초를 초과했습니다."
    except OSError as error:
        returncode = 127
        stdout = ""
        stderr = f"명령 실행 실패: {error}"

    duration = time.monotonic() - started
    rendered = [f"$ {shlex.join(command)}", f"cwd: {cwd or context.repo_root}", "", stdout, stderr]
    log_path.write_text("\n".join(rendered), encoding="utf-8")
    return CommandResult(command, returncode, stdout, stderr, duration, timed_out, log_path)


def command_finding(
    context: AuditContext,
    *,
    check_id: str,
    title: str,
    category: str,
    args: Iterable[str],
    timeout: int | None = None,
    severity: str = "높음",
    success_summary: str = "명령이 정상 종료되었습니다.",
    cwd: Path | None = None,
    extra_env: dict[str, str] | None = None,
) -> Finding:
    result = run_command(
        context,
        check_id,
        args,
        timeout=timeout,
        cwd=cwd,
        extra_env=extra_env,
    )
    status = Status.PASS if result.returncode == 0 else Status.FAIL
    if result.timed_out:
        status = Status.ERROR
    summary = success_summary if status == Status.PASS else f"종료 코드 {result.returncode}. 로그를 확인하세요."
    tail = "\n".join((result.stdout + "\n" + result.stderr).splitlines()[-25:])
    return Finding(
        check_id=check_id,
        title=title,
        status=status,
        summary=summary,
        category=category,
        severity=severity,
        evidence={"command": list(result.args), "returncode": result.returncode, "tail": tail},
        duration_seconds=result.duration_seconds,
        log_path=context.relative(result.log_path),
    )


def run_command_checks(
    context: AuditContext,
    checks: Iterable[CommandCheck],
    *,
    max_workers: int,
) -> list[Finding]:
    """독립 명령을 제한된 슬롯에서 실행하고 선언 순서로 결과를 반환한다."""

    declared = list(checks)
    if not declared:
        return []
    worker_count = max(1, min(max_workers, len(declared)))

    def execute(check: CommandCheck) -> Finding:
        try:
            return command_finding(
                context,
                check_id=check.check_id,
                title=check.title,
                category=check.category,
                args=check.args,
                timeout=check.timeout,
                severity=check.severity,
                success_summary=check.success_summary,
                cwd=check.cwd,
                extra_env=check.extra_env,
            )
        except Exception as error:
            return Finding(
                check.check_id,
                check.title,
                Status.ERROR,
                f"명령 검사 실행 중 예외가 발생했습니다: {error}",
                check.category,
                severity="미검증",
                evidence={"command": list(check.args)},
            )

    if worker_count == 1:
        return [execute(check) for check in declared]

    # 긴 CPU 작업을 먼저 시작하되 보고서의 결과 순서는 기존 선언 순서를 유지한다.
    indexed = list(enumerate(declared))
    scheduled = sorted(indexed, key=lambda item: (item[1].priority, item[0]))
    results: list[Finding | None] = [None] * len(declared)
    with ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="audit-command") as pool:
        futures = {pool.submit(execute, check): index for index, check in scheduled}
        for future in as_completed(futures):
            results[futures[future]] = future.result()
    return [result for result in results if result is not None]


def git_snapshot(context: AuditContext, check_id: str) -> tuple[str, Path]:
    result = run_command(
        context,
        check_id,
        ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"],
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Git 상태 확인 실패: {result.stderr.strip()}")
    return result.stdout, result.log_path
