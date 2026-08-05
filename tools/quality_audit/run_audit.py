#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from auditlib.browser_checks import run_browser_checks
from auditlib.http_checks import BuiltServer, run_http_checks
from auditlib.model import AuditContext, AuditReport, Finding, Status
from auditlib.process import command_exists, git_snapshot, run_command
from auditlib.report import write_json, write_markdown
from auditlib.resources import configure_cpu_budget, executable_versions
from auditlib.static_checks import (
    bundle_size_check,
    documentation_boundary,
    markup_contract,
    risky_api_scan,
    secret_scan,
    source_inventory,
    standard_command_checks,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Quality Hub 전체 코드·테스트·HTTP·브라우저 검수기를 실행합니다.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2], help="Quality Hub 저장소 루트")
    parser.add_argument("--output", type=Path, help="결과 폴더. 생략하면 tools/quality_audit/results 아래에 생성")
    parser.add_argument("--cpu-budget", type=float, default=1.75, help="의도한 CPU 예산. Linux에서는 올림한 최대 2개 논리 CPU affinity로 적용")
    parser.add_argument("--command-timeout", type=int, default=600, help="일반 명령 시간 제한(초)")
    parser.add_argument("--browser-timeout", type=int, default=45, help="브라우저/CDP 대기 시간 제한(초)")
    parser.add_argument("--skip-browser", action="store_true", help="Chromium 기반 axe·화면·성능 검사를 생략")
    parser.add_argument("--include-network", action="store_true", help="외부 npm 레지스트리를 사용하는 npm audit 포함")
    parser.add_argument("--keep-work", action="store_true", help="임시 빌드와 Chromium 프로필을 결과 폴더에 보존")
    return parser.parse_args()


def make_context(args: argparse.Namespace) -> AuditContext:
    repo_root = args.repo.resolve()
    if not (repo_root / "package.json").exists() or not (repo_root / "prototype" / "index.html").exists():
        raise ValueError(f"Quality Hub 저장소 루트가 아닙니다: {repo_root}")
    selected_cpus = configure_cpu_budget(args.cpu_budget)
    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    default_results_root = repo_root / "tools" / "quality_audit" / "results"
    output_dir = args.output.resolve() if args.output else default_results_root / stamp
    if output_dir.is_relative_to(repo_root) and not output_dir.is_relative_to(default_results_root):
        raise ValueError("저장소 안의 --output은 Git에서 제외된 tools/quality_audit/results 아래만 허용합니다. 다른 경로는 /tmp 등을 사용하세요.")
    output_dir.mkdir(parents=True, exist_ok=False)
    work_dir = output_dir / "work"
    logs_dir = output_dir / "logs"
    screenshots_dir = output_dir / "screenshots"
    for path in (work_dir, logs_dir, screenshots_dir):
        path.mkdir(parents=True, exist_ok=True)
    return AuditContext(
        repo_root=repo_root,
        output_dir=output_dir,
        work_dir=work_dir,
        logs_dir=logs_dir,
        screenshots_dir=screenshots_dir,
        selected_cpus=selected_cpus,
        requested_cpu_budget=args.cpu_budget,
        command_timeout=args.command_timeout,
        browser_timeout=args.browser_timeout,
        include_network=args.include_network,
        skip_browser=args.skip_browser,
        keep_work=args.keep_work,
    )


def preflight(context: AuditContext) -> list[Finding]:
    started = time.monotonic()
    missing = [name for name in ("git", "node", "npm") if not command_exists(name)]
    if not (context.repo_root / "node_modules").is_dir():
        missing.append("node_modules (npm install 필요)")
    required_files = [
        "AGENTS.md",
        "server.mjs",
        "vite.config.mjs",
        "prototype/index.html",
        "node_modules/axe-core/axe.min.js",
    ]
    missing_files = [relative for relative in required_files if not (context.repo_root / relative).exists()]
    status = Status.ERROR if missing or missing_files else Status.PASS
    return [Finding(
        "ENV-01",
        "실행 환경·필수 파일",
        status,
        "검수 실행 조건을 확인했습니다." if status == Status.PASS else "필수 실행 조건이 누락됐습니다.",
        "실행 환경",
        severity="차단" if status == Status.ERROR else "정보",
        evidence={"executables": executable_versions(context.repo_root), "missing": missing, "missing_files": missing_files},
        duration_seconds=time.monotonic() - started,
    )]


def collect_git_metadata(context: AuditContext) -> None:
    head = run_command(context, "git-head", ["git", "rev-parse", "HEAD"], timeout=30)
    branch = run_command(context, "git-branch", ["git", "branch", "--show-current"], timeout=30)
    context.metadata.update({"git_head": head.stdout.strip(), "git_branch": branch.stdout.strip() or "detached"})


def add_static_checks(report: AuditReport) -> None:
    context = report.context
    functions = (source_inventory, secret_scan, risky_api_scan, markup_contract, documentation_boundary)
    # I/O 중심 정적 검사는 최대 두 작업만 병렬화한다. CPU affinity 상한은 그대로 유지된다.
    with ThreadPoolExecutor(max_workers=min(2, len(context.selected_cpus))) as pool:
        futures = {pool.submit(function, context): function.__name__ for function in functions}
        for future in as_completed(futures):
            try:
                report.add(future.result())
            except Exception as error:
                report.add(Finding("STATIC-ERROR", futures[future], Status.ERROR, str(error), "정적·구조 검사", severity="미검증"))


def add_runtime_checks(report: AuditReport) -> None:
    context = report.context
    command_findings = standard_command_checks(context)
    report.findings.extend(command_findings)
    build_ok = any(item.check_id == "BUILD-01" and item.status == Status.PASS for item in command_findings)
    report.add(bundle_size_check(context))
    if not build_ok:
        report.add(Finding("HTTP-00", "HTTP·브라우저 검수", Status.SKIP, "프로덕션 빌드 실패로 실행하지 않았습니다.", "HTTP·런타임 검사", severity="미검증"))
        return
    try:
        with BuiltServer(context) as server:
            report.findings.extend(run_http_checks(context, server))
            report.findings.extend(run_browser_checks(context, server))
    except Exception as error:
        report.add(Finding("HTTP-00", "정적 서버 시작·런타임 검수", Status.ERROR, str(error), "HTTP·런타임 검사", severity="미검증"))


def finalize(report: AuditReport, before_status: str) -> None:
    context = report.context
    try:
        after_status, _ = git_snapshot(context, "git-status-after")
        changed = before_status != after_status
        report.add(Finding(
            "GIT-01",
            "검수 전후 작업 트리 보존",
            Status.FAIL if changed else Status.PASS,
            "검수 실행 중 추적·미추적 작업 트리가 바뀌었습니다." if changed else "검수 전후 Git 상태가 동일합니다.",
            "작업 트리 보존",
            severity="높음",
            evidence={"changed": changed, "before_porcelain": before_status.replace("\0", "\\0"), "after_porcelain": after_status.replace("\0", "\\0")},
        ))
    except Exception as error:
        report.add(Finding("GIT-01", "검수 전후 작업 트리 보존", Status.ERROR, str(error), "작업 트리 보존", severity="미검증"))

    report.finished_at = datetime.now(timezone.utc)
    if not context.keep_work and context.work_dir.exists():
        shutil.rmtree(context.work_dir)
    json_path = write_json(report)
    markdown_path = write_markdown(report)
    print(f"\n검수 결과: {markdown_path}")
    print(f"구조화 결과: {json_path}")
    print(f"판정 수: {report.counts}")


def main() -> int:
    args = parse_args()
    try:
        context = make_context(args)
    except Exception as error:
        print(f"실행 준비 실패: {error}", file=sys.stderr)
        return 2

    report = AuditReport(context)
    print(f"Quality Hub 검수를 시작합니다: {context.output_dir}")
    print(f"CPU 요청값 {context.requested_cpu_budget}, affinity {context.selected_cpus}")
    before_status = ""
    requested_exit = 0
    try:
        collect_git_metadata(context)
        before_status, _ = git_snapshot(context, "git-status-before")
        report.findings.extend(preflight(context))
        if any(item.status == Status.ERROR for item in report.findings):
            requested_exit = 2
        else:
            add_static_checks(report)
            add_runtime_checks(report)
    except KeyboardInterrupt:
        report.add(Finding("RUN-INTERRUPTED", "사용자 중단", Status.ERROR, "검수가 사용자에 의해 중단됐습니다.", "실행 환경", severity="미검증"))
        requested_exit = 130
    except Exception as error:
        report.add(Finding("RUN-ERROR", "검수기 예외", Status.ERROR, repr(error), "실행 환경", severity="미검증"))
        requested_exit = 2
    finally:
        finalize(report, before_status)
    return requested_exit or report.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
