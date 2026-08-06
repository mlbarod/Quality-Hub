from __future__ import annotations

import math
import multiprocessing
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CONTROL_INTERVAL_SECONDS = 0.25
WORK_INTERVAL_SECONDS = 0.10


def cpu_floor_duties(requested_cores: float) -> list[float]:
    if requested_cores <= 0:
        raise ValueError("강제 CPU 하한은 0보다 커야 합니다.")
    full_workers = int(math.floor(requested_cores))
    fractional = requested_cores - full_workers
    duties = [1.0] * full_workers
    if fractional > 1e-9:
        duties.append(fractional)
    return duties


def _write_duties(shared_duties: Any, total_duty: float) -> None:
    remaining = max(0.0, total_duty)
    with shared_duties.get_lock():
        for index in range(len(shared_duties)):
            duty = min(1.0, remaining)
            shared_duties[index] = duty
            remaining -= duty


def _cpu_worker(stop_event: Any, shared_duties: Any, worker_index: int, cpu_id: int) -> None:
    if hasattr(os, "sched_setaffinity"):
        os.sched_setaffinity(0, {cpu_id})
    value = (worker_index + 1) * 2654435761
    while not stop_event.is_set():
        interval_started = time.perf_counter()
        with shared_duties.get_lock():
            duty = float(shared_duties[worker_index])
        busy_until = interval_started + WORK_INTERVAL_SECONDS * duty
        while time.perf_counter() < busy_until:
            value = (value * 1664525 + 1013904223) & 0xFFFFFFFF
        remaining = WORK_INTERVAL_SECONDS - (time.perf_counter() - interval_started)
        if remaining > 0:
            stop_event.wait(remaining)
    if value == -1:  # 계산 루프가 제거될 수 없는 관측 가능한 분기
        raise RuntimeError("도달할 수 없는 CPU 작업자 상태")


def _process_ticks(pid: int) -> int | None:
    try:
        text = Path(f"/proc/{pid}/stat").read_text(encoding="ascii", errors="replace")
        fields = text[text.rfind(")") + 2:].split()
        return int(fields[11]) + int(fields[12])
    except (FileNotFoundError, IndexError, ValueError):
        return None


def _process_children(pid: int) -> set[int]:
    children: set[int] = set()
    try:
        task_paths = Path(f"/proc/{pid}/task").iterdir()
        for task_path in task_paths:
            try:
                text = (task_path / "children").read_text(encoding="ascii", errors="replace")
                children.update(int(value) for value in text.split())
            except (FileNotFoundError, ValueError):
                continue
    except FileNotFoundError:
        pass
    return children


def _read_process_tree_ticks(root_pid: int) -> dict[int, int]:
    pending = [root_pid]
    seen: set[int] = set()
    ticks: dict[int, int] = {}
    while pending:
        pid = pending.pop()
        if pid in seen:
            continue
        seen.add(pid)
        value = _process_ticks(pid)
        if value is None:
            continue
        ticks[pid] = value
        pending.extend(_process_children(pid) - seen)
    return ticks


@dataclass(slots=True)
class CpuFloorStats:
    requested_cores: float
    selected_cpus: tuple[int, ...]
    worker_count: int
    samples: int
    observed_average_cores: float | None
    observed_min_cores: float | None
    observed_max_cores: float | None
    average_synthetic_duty: float

    def as_dict(self) -> dict[str, object]:
        return {
            "mode": "synthetic-adaptive-load",
            "requested_cores": self.requested_cores,
            "selected_cpus": self.selected_cpus,
            "worker_count": self.worker_count,
            "samples": self.samples,
            "observed_average_cores": self.observed_average_cores,
            "observed_min_cores": self.observed_min_cores,
            "observed_max_cores": self.observed_max_cores,
            "average_synthetic_duty": self.average_synthetic_duty,
        }


class ForcedCpuFloor:
    def __init__(self, requested_cores: float, selected_cpus: tuple[int, ...]) -> None:
        duties = cpu_floor_duties(requested_cores)
        if len(duties) > len(selected_cpus):
            raise ValueError(f"--force-cpu-floor {requested_cores}에는 최소 {len(duties)}개 CPU가 필요하지만 {len(selected_cpus)}개만 선택됐습니다.")
        self.requested_cores = requested_cores
        self.selected_cpus = selected_cpus
        self.initial_duties = duties
        self._processes: list[multiprocessing.Process] = []
        self._worker_stop: Any = None
        self._shared_duties: Any = None
        self._controller_stop = threading.Event()
        self._controller: threading.Thread | None = None
        self._observed_samples: list[float] = []
        self._duty_samples: list[float] = []
        self._root_pid = os.getpid()

    def start(self) -> None:
        context = multiprocessing.get_context("spawn")
        self._worker_stop = context.Event()
        self._shared_duties = context.Array("d", self.initial_duties, lock=True)
        worker_cpus = self.selected_cpus[-len(self.initial_duties):]
        try:
            for index, cpu_id in enumerate(worker_cpus):
                process = context.Process(
                    target=_cpu_worker,
                    args=(self._worker_stop, self._shared_duties, index, cpu_id),
                    name=f"quality-audit-cpu-floor-{index + 1}",
                    daemon=True,
                )
                process.start()
                self._processes.append(process)
            self._controller = threading.Thread(target=self._control_loop, name="quality-audit-cpu-floor-controller", daemon=True)
            self._controller.start()
        except Exception:
            self.stop()
            raise

    def _control_loop(self) -> None:
        previous = _read_process_tree_ticks(self._root_pid)
        previous_at = time.monotonic()
        clock_ticks = float(os.sysconf("SC_CLK_TCK"))
        current_duty = sum(self.initial_duties)
        while not self._controller_stop.wait(CONTROL_INTERVAL_SECONDS):
            current_at = time.monotonic()
            current = _read_process_tree_ticks(self._root_pid)
            # 새 PID의 기존 누적 시간은 첫 샘플에서 사용량으로 오인하지 않고 기준점으로만 등록한다.
            tick_delta = sum(max(0, ticks - previous[pid]) for pid, ticks in current.items() if pid in previous)
            elapsed = current_at - previous_at
            previous = current
            previous_at = current_at
            if elapsed <= 0:
                continue
            observed = tick_delta / clock_ticks / elapsed
            self._observed_samples.append(observed)
            current_duty = min(self.requested_cores, max(0.0, current_duty + 0.7 * (self.requested_cores - observed)))
            self._duty_samples.append(current_duty)
            _write_duties(self._shared_duties, current_duty)

    def stop(self) -> CpuFloorStats:
        self._controller_stop.set()
        if self._controller:
            self._controller.join(timeout=2)
        if self._worker_stop:
            self._worker_stop.set()
        for process in self._processes:
            process.join(timeout=2)
            if process.is_alive():
                process.terminate()
                process.join(timeout=2)
        samples = self._observed_samples
        duties = self._duty_samples
        return CpuFloorStats(
            requested_cores=self.requested_cores,
            selected_cpus=self.selected_cpus,
            worker_count=len(self._processes),
            samples=len(samples),
            observed_average_cores=sum(samples) / len(samples) if samples else None,
            observed_min_cores=min(samples) if samples else None,
            observed_max_cores=max(samples) if samples else None,
            average_synthetic_duty=sum(duties) / len(duties) if duties else sum(self.initial_duties),
        )
