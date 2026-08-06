from __future__ import annotations

import unittest
from pathlib import Path
from threading import Barrier, Lock
from unittest.mock import patch

from auditlib.model import Finding, Status
from auditlib.process import CommandCheck, run_command_checks
from auditlib.report import _json_safe
from auditlib.resources import THREAD_ENV_KEYS, child_environment
from auditlib.static_checks import MarkupInspector


class ModelTests(unittest.TestCase):
    def test_finding_serializes_status_as_string(self) -> None:
        finding = Finding("TEST", "테스트", Status.PASS, "통과", "자체 검사")
        self.assertEqual(finding.as_dict()["status"], "PASS")
        self.assertEqual(str(Status.PASS), "PASS")

    def test_json_safe_converts_paths_and_tuples(self) -> None:
        value = _json_safe({"path": Path("a/b"), "cpus": (1, 2)})
        self.assertEqual(value, {"path": "a/b", "cpus": [1, 2]})


class ResourceTests(unittest.TestCase):
    def test_child_environment_limits_thread_pools(self) -> None:
        env = child_environment((2, 3))
        self.assertEqual(env["UV_THREADPOOL_SIZE"], "2")
        self.assertEqual(env["QUALITY_AUDIT_CPU_SET"], "2,3")
        for key in THREAD_ENV_KEYS:
            self.assertEqual(env[key], "2")


class ParallelCommandTests(unittest.TestCase):
    def test_expensive_commands_start_first_and_results_keep_declared_order(self) -> None:
        checks = [
            CommandCheck("LATE", "나중 작업", "자체 검사", ("late",), priority=100),
            CommandCheck("FAST-1", "우선 작업 1", "자체 검사", ("fast-1",), priority=10),
            CommandCheck("FAST-2", "우선 작업 2", "자체 검사", ("fast-2",), priority=10),
        ]
        first_wave = Barrier(2)
        lock = Lock()
        started: list[str] = []

        def fake_command_finding(_context: object, **kwargs: object) -> Finding:
            check_id = str(kwargs["check_id"])
            with lock:
                started.append(check_id)
            if check_id.startswith("FAST"):
                first_wave.wait(timeout=2)
            return Finding(check_id, str(kwargs["title"]), Status.PASS, "통과", str(kwargs["category"]))

        with patch("auditlib.process.command_finding", side_effect=fake_command_finding):
            findings = run_command_checks(object(), checks, max_workers=2)  # type: ignore[arg-type]

        self.assertCountEqual(started[:2], ["FAST-1", "FAST-2"])
        self.assertEqual([finding.check_id for finding in findings], ["LATE", "FAST-1", "FAST-2"])


class MarkupTests(unittest.TestCase):
    def test_markup_inspector_collects_duplicate_ids_and_missing_alt(self) -> None:
        inspector = MarkupInspector()
        inspector.feed('<main id="content"><button id="save">저장</button><div id="content"></div><img src="x.png"></main>')
        self.assertEqual(inspector.ids.count("content"), 2)
        self.assertEqual(inspector.images_without_alt, [1])
        self.assertEqual(inspector.controls[0]["id"], "save")


if __name__ == "__main__":
    unittest.main()
