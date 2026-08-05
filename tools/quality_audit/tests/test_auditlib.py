from __future__ import annotations

import unittest
from pathlib import Path

from auditlib.model import Finding, Status
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


class MarkupTests(unittest.TestCase):
    def test_markup_inspector_collects_duplicate_ids_and_missing_alt(self) -> None:
        inspector = MarkupInspector()
        inspector.feed('<main id="content"><button id="save">저장</button><div id="content"></div><img src="x.png"></main>')
        self.assertEqual(inspector.ids.count("content"), 2)
        self.assertEqual(inspector.images_without_alt, [1])
        self.assertEqual(inspector.controls[0]["id"], "save")


if __name__ == "__main__":
    unittest.main()
