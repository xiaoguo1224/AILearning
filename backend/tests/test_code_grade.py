"""Code answers are graded against their own question, not exact-matched.

A code submission IS the answer to its question — the analogue of picking an
option on a multiple-choice item — so POST /quiz/{id}/answer sends code-kind
items to the model for a verdict, with the question and reference solution as
the grading context. Static reading only; the server never executes code.
"""

import json

import pytest

from app import code_grade
from app.code_grade import GradeParseError


def _seed_code_item(client):
    """One course with one code-kind quiz item, seeded straight into the DB."""
    from app import models
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        course = models.Course(title="Code grade course", description="")
        module = models.Module(title="M1", position=0)
        lesson = models.Lesson(title="L1", position=0, content="content")
        item = models.QuizItem(
            question="实现 add(a, b) 返回两数之和",
            kind="code",
            options=[],
            answer="def add(a, b):\n    return a + b",
            concept="函数",
        )
        lesson.quiz_items.append(item)
        module.lessons.append(lesson)
        course.modules.append(module)
        session.add(course)
        session.commit()
        return item.id
    finally:
        session.close()


class _Grader:
    """Stub provider answering the code-grade prompt with a fixed verdict."""

    name = "fake"
    model = "code-grade-test"
    is_paid = False

    def __init__(self, verdict):
        self.verdict = verdict
        self.calls = 0

    def generate(self, system, prompt, max_tokens=64000):
        self.calls += 1
        from app.llm.base import LLMResult

        return LLMResult(text=self.verdict)


def _patch_grader(monkeypatch, verdict):
    from app import main

    grader = _Grader(verdict)
    monkeypatch.setattr(main, "get_provider", lambda: grader)
    return grader


def test_correct_code_answer_records_llm_verdict(client, monkeypatch):
    item_id = _seed_code_item(client)
    grader = _patch_grader(
        monkeypatch, json.dumps({"correct": True, "feedback": "实现正确，返回了两数之和。"})
    )
    response = client.post(f"/quiz/{item_id}/answer", json={"answer": "def add(a, b):\n    return a+b"})
    assert response.status_code == 200, response.text
    assert grader.calls == 1
    body = response.json()
    assert body["correct"] is True
    assert body["feedback"] == "实现正确，返回了两数之和。"
    assert body["attempt_no"] == 1

    from app import models
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        attempt = session.query(models.Attempt).filter_by(quiz_item_id=item_id).one()
        assert attempt.correct is True
        assert attempt.grader == code_grade.CODE_GRADER
    finally:
        session.close()


def test_wrong_code_answer_reports_the_error(client, monkeypatch):
    item_id = _seed_code_item(client)
    _patch_grader(
        monkeypatch, json.dumps({"correct": False, "feedback": "返回的是差值，不是和。"})
    )
    response = client.post(f"/quiz/{item_id}/answer", json={"answer": "def add(a, b):\n    return a-b"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["correct"] is False
    assert body["feedback"] == "返回的是差值，不是和。"


def test_unparseable_verdict_is_502_without_recording(client, monkeypatch):
    item_id = _seed_code_item(client)
    _patch_grader(monkeypatch, "this is not json")
    response = client.post(f"/quiz/{item_id}/answer", json={"answer": "def add(a, b):\n    return a+b"})
    assert response.status_code == 502, response.text

    from app import models
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        assert session.query(models.Attempt).filter_by(quiz_item_id=item_id).count() == 0
    finally:
        session.close()


def test_non_code_items_still_exact_match_without_feedback(client, monkeypatch):
    item_id = _seed_code_item(client)
    from app import models
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        item = session.get(models.QuizItem, item_id)
        item.kind = "short"
        item.answer = "和"
        session.commit()
    finally:
        session.close()

    grader = _patch_grader(monkeypatch, json.dumps({"correct": True, "feedback": "x"}))
    response = client.post(f"/quiz/{item_id}/answer", json={"answer": "和"})
    assert response.status_code == 200, response.text
    assert grader.calls == 0, "short answers must not call the model"
    body = response.json()
    assert body["correct"] is True
    assert body["feedback"] is None


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "[1, 2]",
        json.dumps({"correct": "yes", "feedback": "x"}),
        json.dumps({"correct": True, "feedback": "  "}),
        json.dumps({"correct": True}),
    ],
)
def test_parse_verdict_rejects_junk(raw):
    with pytest.raises(GradeParseError):
        code_grade.parse_verdict(raw)


def test_parse_verdict_accepts_shape():
    assert code_grade.parse_verdict(json.dumps({"correct": False, "feedback": "错了。"})
    ) == (False, "错了。")


def _hint_grader(monkeypatch, text):
    from app import main

    grader = _Grader(text)
    monkeypatch.setattr(main, "get_provider", lambda: grader)
    return grader


def test_quiz_hint_levels_are_progressive(client, monkeypatch):
    import json as _json

    item_id = _seed_code_item(client)
    # Answer wrong first so the hint can react to the submission.
    _patch_grader(
        monkeypatch, _json.dumps({"correct": False, "feedback": "返回的是差值。"})
    )
    assert (
        client.post(f"/quiz/{item_id}/answer", json={"answer": "def add(a, b):\n    return a-b"}).status_code
        == 200
    )
    for level, hint_text in [(1, "看看 return 那一行用的运算符。"), (2, "加法不是减法。")]:
        _hint_grader(monkeypatch, _json.dumps({"hint": hint_text}))
        response = client.post(f"/quiz/{item_id}/hints", json={"level": level})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["level"] == level
        assert body["hint"] == hint_text


def test_quiz_hint_rejects_bad_level_and_kind(client, monkeypatch):
    item_id = _seed_code_item(client)
    assert client.post(f"/quiz/{item_id}/hints", json={"level": 4}).status_code == 422
    assert client.post("/quiz/999999/hints", json={"level": 1}).status_code == 404

    from app import models
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        session.get(models.QuizItem, item_id).kind = "short"
        session.commit()
    finally:
        session.close()
    assert client.post(f"/quiz/{item_id}/hints", json={"level": 1}).status_code == 422


def test_quiz_hint_unparseable_is_502(client, monkeypatch):
    item_id = _seed_code_item(client)
    _hint_grader(monkeypatch, "junk")
    assert client.post(f"/quiz/{item_id}/hints", json={"level": 1}).status_code == 502
