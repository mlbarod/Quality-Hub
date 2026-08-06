from __future__ import annotations

import math
import os
import platform
import shutil
from pathlib import Path


THREAD_ENV_KEYS = (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "NUMEXPR_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
    "BLIS_NUM_THREADS",
    "RAYON_NUM_THREADS",
)


def cpu_affinity_slots(requested_budget: float) -> int:
    if not 1.0 <= requested_budget <= 2.0:
        raise ValueError("--cpu-budget은 1.0 이상 2.0 이하이어야 합니다.")
    return 1 if requested_budget == 1.0 else min(4, max(2, math.ceil(requested_budget * 2)))


def configure_cpu_budget(requested_budget: float) -> tuple[int, ...]:
    """평균 CPU 목표를 위해 대기형 작업이 사용할 affinity 여유를 선택한다.

    1 CPU 요청은 직렬 실행을 유지한다. 그보다 큰 요청은 브라우저 대기를
    겹칠 수 있도록 목표값의 두 배를 올림한 논리 CPU(최대 4개)를 허용한다.
    affinity는 CPU quota가 아니며 실제 실행 레인 수는 별도로 제한한다.
    """

    desired_count = cpu_affinity_slots(requested_budget)
    if hasattr(os, "sched_getaffinity") and hasattr(os, "sched_setaffinity"):
        allowed = sorted(os.sched_getaffinity(0))
        selected = tuple(allowed[:desired_count])
        if selected:
            os.sched_setaffinity(0, set(selected))
            return selected

    available = os.cpu_count() or 1
    return tuple(range(min(desired_count, available)))


def child_environment(selected_cpus: tuple[int, ...]) -> dict[str, str]:
    env = os.environ.copy()
    thread_count = str(max(1, min(2, len(selected_cpus))))
    for key in THREAD_ENV_KEYS:
        env[key] = thread_count
    env["UV_THREADPOOL_SIZE"] = thread_count
    env["QUALITY_AUDIT_CPU_SET"] = ",".join(map(str, selected_cpus))
    env["NO_COLOR"] = "1"
    env["FORCE_COLOR"] = "0"
    return env


def executable_versions(repo_root: Path) -> dict[str, str | None]:
    return {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "node": shutil.which("node"),
        "npm": shutil.which("npm"),
        "git": shutil.which("git"),
        "repo": str(repo_root),
    }
