from __future__ import annotations

import os
import shlex
import subprocess
import time
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
