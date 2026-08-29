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
        self.assertEqual(questions[0].question_id, 17)
        self.assertEqual(questions[0].body_text, "질문 본문 다음 줄")
        self.assertEqual(questions[0].status, "completed")
        self.assertEqual([message.source_field for message in questions[0].messages], ["ans_comment", "add_comment"])

    def test_converts_legacy_html_to_safe_text_and_html(self):
        questions, _report = self.transform([valid_record()])
        question = questions[0]

        self.assertEqual(question.body_text, "질문 본문 다음 줄")
        self.assertNotIn("script", question.body_html)
        self.assertNotIn("alert", question.body_html)

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

    def test_rejects_duplicate_question_ids(self):
        questions, report = self.transform([valid_record(), valid_record(no="OLD-18")])

        self.assertEqual(len(questions), 1)
        self.assertEqual(len(report.errors), 1)
        self.assertIn("중복된 id", report.errors[0]["reason"])

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


if __name__ == "__main__":
    unittest.main()
