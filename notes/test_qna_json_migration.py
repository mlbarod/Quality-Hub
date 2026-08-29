import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("qna_json_migration.py")
SPEC = importlib.util.spec_from_file_location("qna_json_migration", MODULE_PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MIGRATION
SPEC.loader.exec_module(MIGRATION)

REPAIR_PATH = Path(__file__).with_name("qna_html_repair.py")
REPAIR_SPEC = importlib.util.spec_from_file_location("qna_html_repair", REPAIR_PATH)
REPAIR = importlib.util.module_from_spec(REPAIR_SPEC)
assert REPAIR_SPEC.loader is not None
sys.modules[REPAIR_SPEC.name] = REPAIR
REPAIR_SPEC.loader.exec_module(REPAIR)


def valid_record(**overrides):
    record = {
        "id": 17,
        "no": "OLD-17",
        "title": "FDC 문의",
        "group2": "FDC",
        "line": "L1",
        "req_knoxid": "user.1",
        "reqname": "질문자",
        "reqdate": "2025-01-02 03:04:05",
        "status2": "답변 완료",
        "ans_knoxid": "user.2",
        "ansname": "답변자",
        "ansdate": "2025-01-03 04:05:06",
        "req_comment": "<p>질문 본문<br>다음 줄</p><script>alert(1)</script>",
        "ans_comment": "첫 답변",
        "add_comment": "두 번째 답변",
    }
    record.update(overrides)
    return record


class QnaJsonMigrationTest(unittest.TestCase):
    def transform(self, records):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.json"
            path.write_text(json.dumps({MIGRATION.ROOT_KEY: records}, ensure_ascii=False), encoding="utf-8")
            report = MIGRATION.MigrationReport(mode="validate", source_file=str(path))
            questions = MIGRATION.load_and_transform(path, report)
            return questions, report

    def test_maps_question_body_and_two_possible_messages(self):
        questions, report = self.transform([valid_record()])

        self.assertEqual(report.errors, [])
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0].legacy_id, "17")
        self.assertEqual(questions[0].body_text, "질문 본문 다음 줄")
        self.assertEqual(questions[0].status, "completed")
        self.assertEqual([message.source_field for message in questions[0].messages], ["ans_comment", "add_comment"])

    def test_converts_legacy_html_to_safe_text_and_html(self):
        questions, _report = self.transform([valid_record()])
        question = questions[0]

        self.assertEqual(question.body_text, "질문 본문 다음 줄")
        self.assertNotIn("script", question.body_html)
        self.assertNotIn("alert", question.body_html)

    def test_preserves_table_and_valid_base64_png_but_removes_executable_html(self):
        png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        raw_html = (
            "<table style='color:red'><tr><td colspan='2'>측정값</td></tr></table>"
            f"<img src='data:image/png;base64,{png}' onerror='alert(1)' />"
            "<script>alert(2)</script>"
        )

        sanitized = MIGRATION.sanitize_legacy_html(raw_html)

        self.assertIn("<table>", sanitized)
        self.assertIn('<td colspan="2">측정값</td>', sanitized)
        self.assertIn(f'<img src="data:image/png;base64,{png}">', sanitized)
        self.assertNotIn("style=", sanitized)
        self.assertNotIn("onerror", sanitized)
        self.assertNotIn("script", sanitized)
        self.assertNotIn("alert", sanitized)
        REPAIR.validate_embedded_image(f"data:image/png;base64,{png}")

    def test_prepares_existing_question_html_repair_from_id_mapping(self):
        png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        record = valid_record(
            id="12345678901234567",
            req_comment=f"<p>본문</p><table><tr><td>값</td></tr></table><img src='data:image/png;base64,{png}'>",
        )
        source = {MIGRATION.ROOT_KEY: [record]}
        migration_report = {
            "status": "completed",
            "id_mapping": [{"legacy_id": "12345678901234567", "question_id": 101}],
        }

        repairs = REPAIR.prepare_repairs(source, migration_report)

        self.assertEqual(len(repairs), 1)
        self.assertEqual(repairs[0]["question_id"], 101)
        self.assertEqual(repairs[0]["image_count"], 1)
        self.assertEqual(repairs[0]["embedded_image_count"], 1)
        self.assertEqual(repairs[0]["table_count"], 1)

    def test_uses_legacy_data_src_and_skips_img_without_a_source(self):
        png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        raw_html = (
            "<p>본문</p><img alt='소스 없음'>"
            f"<img data-src='data:image/x-png;base64,{png}'>"
        )

        sanitized = MIGRATION.sanitize_legacy_html(raw_html)

        self.assertEqual(sanitized.count("<img"), 1)
        self.assertIn(f'<img src="data:image/png;base64,{png}">', sanitized)

        source = {MIGRATION.ROOT_KEY: [valid_record(id="12345678901234567", req_comment=raw_html)]}
        migration_report = {
            "status": "completed",
            "id_mapping": [{"legacy_id": "12345678901234567", "question_id": 101}],
        }
        repairs = REPAIR.prepare_repairs(source, migration_report)

        self.assertEqual(repairs[0]["image_count"], 1)
        self.assertEqual(repairs[0]["skipped_image_count"], 1)

    def test_waiting_with_message_becomes_active(self):
        questions, report = self.transform([valid_record(status2="waiting")])

        self.assertEqual(questions[0].status, "active")
        self.assertEqual(report.warning_counts["status_waiting_changed_to_active"], 1)

    def test_defaults_unknown_category_and_missing_authors(self):
        questions, report = self.transform([
            valid_record(group2="기타", req_knoxid=None, reqname=None, ans_knoxid=None, ansname=None)
        ])

        self.assertEqual(questions[0].category, "미분류")
        self.assertEqual(questions[0].author_user_id, "legacy-question-author-unknown")
        self.assertEqual(questions[0].messages[0].author_user_id, "legacy-answer-author-unknown")
        self.assertEqual(report.warning_counts["category_defaulted"], 1)
        self.assertEqual(report.warning_counts["author_user_id_defaulted"], 2)

    def test_rejects_duplicate_legacy_ids(self):
        questions, report = self.transform([valid_record(), valid_record(no="OLD-18")])

        self.assertEqual(len(questions), 1)
        self.assertEqual(len(report.errors), 1)
        self.assertIn("중복된 id", report.errors[0]["reason"])

    def test_accepts_17_digit_legacy_id_as_string(self):
        questions, report = self.transform([valid_record(id="12345678901234567")])

        self.assertEqual(report.errors, [])
        self.assertEqual(questions[0].legacy_id, "12345678901234567")

    def test_requires_answer_date_only_when_answer_exists(self):
        questions, report = self.transform([
            valid_record(ans_comment=None, add_comment=None, ansdate=None, status2=None)
        ])

        self.assertEqual(report.errors, [])
        self.assertEqual(questions[0].messages, ())
        self.assertEqual(questions[0].status, "waiting")

    def test_requires_question_body(self):
        questions, report = self.transform([valid_record(req_comment=None)])

        self.assertEqual(questions, [])
        self.assertEqual(len(report.errors), 1)
        self.assertEqual(report.errors[0]["field"], "req_comment")

    def test_uses_database_generated_id_for_question_and_messages(self):
        questions, report = self.transform([valid_record(id="12345678901234567")])

        class FakeCursor:
            def __init__(self):
                self.lastrowid = 0
                self.question_ids = []
                self.message_question_ids = []
                self.result = None

            def execute(self, sql, parameters=()):
                if parameters and sql.count("%s") != len(parameters):
                    raise AssertionError("SQL placeholder count mismatch")
                if f"INSERT INTO `{MIGRATION.QUESTION_TABLE}`" in sql:
                    self.lastrowid = 101
                    self.question_ids.append(self.lastrowid)
                elif f"INSERT INTO `{MIGRATION.MESSAGE_TABLE}`" in sql:
                    self.message_question_ids.append(parameters[0])
                elif f"FROM `{MIGRATION.QUESTION_TABLE}`" in sql:
                    self.result = (len(self.question_ids),)
                elif f"FROM `{MIGRATION.MESSAGE_TABLE}`" in sql:
                    self.result = (len(self.message_question_ids),)

            def fetchone(self):
                return self.result

            def close(self):
                pass

        class FakeConnection:
            def __init__(self):
                self.db_cursor = FakeCursor()
                self.committed = False
                self.rolled_back = False

            def cursor(self):
                return self.db_cursor

            def commit(self):
                self.committed = True

            def rollback(self):
                self.rolled_back = True

        connection = FakeConnection()
        original_inspect = MIGRATION.inspect_database
        MIGRATION.inspect_database = lambda _connection, _report: {
            MIGRATION.QUESTION_TABLE: 3,
            MIGRATION.MESSAGE_TABLE: 4,
        }
        try:
            MIGRATION.apply_migration(connection, questions, report, allow_nonempty=True)
        finally:
            MIGRATION.inspect_database = original_inspect

        self.assertTrue(connection.committed)
        self.assertFalse(connection.rolled_back)
        self.assertEqual(connection.db_cursor.question_ids, [101])
        self.assertEqual(connection.db_cursor.message_question_ids, [101, 101])
        self.assertEqual(report.id_mapping, [{
            "legacy_id": "12345678901234567",
            "question_id": 101,
        }])


if __name__ == "__main__":
    unittest.main()
