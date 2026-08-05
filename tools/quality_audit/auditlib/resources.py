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


def configure_cpu_budget(requested_budget: float) -> tuple[int, ...]:
    """현재 검수 프로세스와 자식 프로세스를 최대 두 논리 CPU에 묶는다.

    1.5 같은 소수 값은 CPU 시간 할당량이 아니라 의도한 병렬성이다. Linux
    affinity는 정수 CPU 집합만 지원하므로 올림한 CPU 수(최대 2개)를 사용한다.
    """

    if not 1.0 <= requested_budget <= 2.0:
        raise ValueError("--cpu-budget은 1.0 이상 2.0 이하이어야 합니다.")

    desired_count = min(2, max(1, math.ceil(requested_budget)))
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
    thread_count = str(max(1, len(selected_cpus)))
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

