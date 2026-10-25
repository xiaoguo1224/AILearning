"""Immutable answers, deferred AI outputs, and cache reuse without paid calls."""

import json

import pytest

from app import models
from app.db import SessionLocal
from app.llm.base import LLMResult


def seed(kind="fill"):
    with SessionLocal() as session:
        course = models.Course(title="History course")
        module = models.Module(title="M", position=0)
        lesson = models.Lesson(title="L", content="lesson", position=0)
        item = models.QuizItem(question="Original question", kind=kind, options=["old", "other"], answer="old")
        lesson.quiz_items.append(item)
        module.lessons.append(lesson)
        course.modules.append(module)
        session.add(course)
        session.commit()
        return course.id, lesson.id, item.id


def history(client, item_id):
    return client.get(f"/api/answer-history?question_id={item_id}").json()["items"]


class Provider:
    name, model, is_paid = "fake", "history-test", False

    def __init__(self, text="Saved AI analysis"):
        self.text, self.prompts = text, []

    def generate(self, system, prompt, max_tokens=64000, **kwargs):
        self.prompts.append(prompt)
        return LLMResult(text=self.text)


@pytest.fixture
def providers(monkeypatch):
    import app.llm
    from app.course_quiz import router
    from app.jobs import service

    provider = Provider()
    monkeypatch.setattr(router, "get_provider", lambda: provider)
    monkeypatch.setattr(app.llm, "get_provider", lambda: provider)
    monkeypatch.setattr(service, "run_in_background", lambda job_id, fn: fn(job_id))
    return provider


@pytest.mark.parametrize("kind", ["mcq", "true_false", "fill", "short", "code"])
def test_all_kinds_freeze_question_answer_feedback(client, monkeypatch, kind):
    from app import main

    monkeypatch.setattr(main, "_judge_answer", lambda *a, **k: (True, "Original feedback", "test"))
    course_id, _, item_id = seed(kind)
    result = client.post(f"/quiz/{item_id}/answer", json={"answer": "old"})
    assert result.status_code == 200, result.text
    record = history(client, item_id)[0]
    with SessionLocal() as session:
        item = session.get(models.QuizItem, item_id)
        item.question, item.answer, item.options = "Changed question", "changed", []
        session.commit()
    hidden = client.get(f"/api/answer-history/{record['id']}").json()
    assert "expected" not in hidden["snapshot"]
    saved = client.get(f"/api/answer-history/{record['id']}?reveal=true").json()["snapshot"]
    assert saved["question"] == "Original question"
    assert saved["options"] == ["old", "other"]
    assert saved["submitted_answer"] == saved["expected"] == "old"
    assert saved["feedback"] == "Original feedback"
    assert saved["complete"] is True
    assert client.get(f"/api/answer-history?course_id={course_id}").json()["total"] == 1


def test_deferred_analysis_uses_old_snapshot_and_reuses_it(client, providers):
    _, _, item_id = seed()
    client.post(f"/quiz/{item_id}/answer", json={"answer": "wrong"})
    record_id = history(client, item_id)[0]["id"]
    with SessionLocal() as session:
        item = session.get(models.QuizItem, item_id)
        item.question, item.answer = "NEW QUESTION", "NEW ANSWER"
        session.commit()
    response = client.post(f"/api/answer-history/{record_id}/analysis/job")
    assert response.status_code == 200, response.text
    assert len(providers.prompts) == 1
    assert "Original question" in providers.prompts[0]
    assert "REFERENCE ANSWER:\nold" in providers.prompts[0]
    assert "NEW QUESTION" not in providers.prompts[0]
    assert client.post(f"/api/answer-history/{record_id}/analysis/job").json() == {"cached": True}
    assert len(providers.prompts) == 1
    detail = client.get(f"/api/answer-history/{record_id}").json()
    assert detail["has_analysis"] is True
    assert detail["events"][0]["payload"]["analysis"] == "Saved AI analysis"
    assert client.post(f"/api/quiz/{item_id}/answer-analysis", json={}).json()["cached"] is True


def test_archived_answer_can_be_analysed_and_explained(client, providers):
    course_id, _, item_id = seed()
    client.post(f"/quiz/{item_id}/answer", json={"answer": "old"})
    record_id = history(client, item_id)[0]["id"]
    with SessionLocal() as session:
        session.delete(session.get(models.Course, course_id))
        session.commit()
    for kind in ("analysis", "solution"):
        response = client.post(f"/api/answer-history/{record_id}/{kind}/job")
        assert response.status_code == 200, response.text
        assert client.get(f"/api/jobs/{response.json()['job_id']}").json()["status"] == "completed"
        assert client.post(f"/api/answer-history/{record_id}/{kind}/job").json()["cached"] is True
    assert len(providers.prompts) == 2
    detail = client.get(f"/api/answer-history/{record_id}?reveal=true").json()
    assert {e["kind"] for e in detail["events"]} == {"answer_analysis", "solution"}
    assert client.get(f"/api/answer-history?course_id={course_id}").json()["total"] == 1


def test_failed_analysis_can_retry_without_recording_a_result(client, providers):
    _, _, item_id = seed()
    client.post(f"/quiz/{item_id}/answer", json={"answer": "old"})
    record_id = history(client, item_id)[0]["id"]
    providers.text = ""
    first = client.post(f"/api/answer-history/{record_id}/analysis/job").json()
    assert client.get(f"/api/jobs/{first['job_id']}").json()["status"] == "failed"
    assert client.get(f"/api/answer-history/{record_id}").json()["has_analysis"] is False
    providers.text = "Recovered analysis"
    second = client.post(f"/api/answer-history/{record_id}/analysis/job").json()
    assert first["job_id"] != second["job_id"]
    assert client.get(f"/api/answer-history/{record_id}").json()["has_analysis"] is True


def test_live_analysis_is_joined_and_pagination_is_bounded(client, monkeypatch):
    from app.jobs import service

    monkeypatch.setattr(service, "run_in_background", lambda *a: None)
    _, _, item_id = seed()
    client.post(f"/quiz/{item_id}/answer", json={"answer": "old"})
    record_id = history(client, item_id)[0]["id"]
    first = client.post(f"/api/answer-history/{record_id}/analysis/job").json()
    second = client.post(f"/api/answer-history/{record_id}/analysis/job").json()
    assert first["job_id"] == second["job_id"]
    assert second["resumed"] is True
    assert client.get("/api/answer-history?limit=101").status_code == 422
    assert client.get("/api/answer-history?offset=-1").status_code == 422
    assert client.get("/api/answer-history/99999999").status_code == 404


def test_legacy_backfill_is_honest_and_idempotent(client):
    from app.answer_history.service import backfill

    _, lesson_id, item_id = seed()
    with SessionLocal() as session:
        session.add(models.Attempt(quiz_item_id=item_id, lesson_id=lesson_id, submitted_answer="legacy",
                                   expected_answer="old key", correct=False, attempt_no=1, source="review_session"))
        session.commit()
        backfill(session)
        session.commit()
        backfill(session)
        session.commit()
    assert len(history(client, item_id)) == 1
    saved = client.get(f"/api/answer-history/{history(client, item_id)[0]['id']}?reveal=true").json()["snapshot"]
    assert saved["complete"] is False
    assert "question" not in saved and "solution" not in saved
    assert saved["question_context"] == "Original question"
    assert saved["expected"] == "old key"


def test_code_submission_ai_only_and_review_snapshot(client, monkeypatch):
    from app.submissions import llm_review

    provider = Provider(json.dumps({"summary": "AI review", "findings": [], "hint_level_1": "clue",
                                    "reference_solution": "print('original solution')"}))
    monkeypatch.setattr(llm_review, "get_provider", lambda: provider)
    _, _, item_id = seed("code")
    sub = client.post(f"/api/quiz/{item_id}/submissions", json={"code": "invalid python !", "log_content": "my log"}).json()
    response = client.post(f"/api/submissions/{sub['id']}/review?use_llm=false")
    assert response.status_code == 201, response.text
    assert response.json()["llm_status"] == "used"
    assert client.post(f"/api/submissions/{sub['id']}/review").json()["id"] == response.json()["id"]
    assert len(provider.prompts) == 1
    record_id = history(client, item_id)[0]["id"]
    hidden = client.get(f"/api/answer-history/{record_id}").json()
    assert "reference_solution" not in hidden["events"][0]["payload"]
    saved = client.get(f"/api/answer-history/{record_id}?reveal=true").json()
    assert saved["snapshot"]["artifacts"][0]["content"] == "invalid python !"
    assert saved["events"][0]["payload"]["reference_solution"] == "print('original solution')"


def test_model_failure_does_not_fall_back_to_rules(client, monkeypatch):
    from app.submissions import llm_review

    monkeypatch.setattr(llm_review, "get_provider", lambda: Provider("not json"))
    _, _, item_id = seed("code")
    sub = client.post(f"/api/quiz/{item_id}/submissions", json={"code": "print(1)"}).json()
    response = client.post(f"/api/submissions/{sub['id']}/review")
    assert response.status_code == 502
    assert client.get(f"/api/submissions/{sub['id']}").json()["reviews"] == []


def test_hints_generated_before_submission_are_frozen(client, monkeypatch):
    from app import main

    monkeypatch.setattr(main.quiz_hint, "hint_for", lambda *args: "Saved hint before answering")
    monkeypatch.setattr(main, "_judge_answer", lambda *args, **kwargs: (True, "feedback", "test"))
    _, _, item_id = seed("code")
    assert client.post(f"/quiz/{item_id}/hints", json={"level": 2}).status_code == 200
    client.post(f"/quiz/{item_id}/answer", json={"answer": "my code"})
    record_id = history(client, item_id)[0]["id"]
    assert "hints" not in client.get(f"/api/answer-history/{record_id}").json()["snapshot"]
    snapshot = client.get(f"/api/answer-history/{record_id}?reveal=true").json()["snapshot"]
    assert snapshot["hints"] == [{"level": 2, "hint": "Saved hint before answering"}]


def test_concurrent_requests_join_one_analysis_job(client, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    from app.jobs import service

    monkeypatch.setattr(service, "run_in_background", lambda *args: None)
    _, _, item_id = seed()
    client.post(f"/quiz/{item_id}/answer", json={"answer": "old"})
    record_id = history(client, item_id)[0]["id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: client.post(f"/api/answer-history/{record_id}/analysis/job"), range(2)))
    assert all(r.status_code == 200 for r in replies)
    assert replies[0].json()["job_id"] == replies[1].json()["job_id"]


def test_variant_exercise_history_is_scoped_and_freezes_its_prompt(client):
    from app.projects.models import Project
    from app.submissions.models import VariantExercise

    with SessionLocal() as session:
        project = Project(name="Variant history")
        session.add(project)
        session.flush()
        variant = VariantExercise(project_id=project.id, title="V", prompt="Original variant prompt", acceptance="Original rule")
        session.add(variant)
        session.commit()
        project_id, variant_id = project.id, variant.id
    response = client.post(f"/api/projects/{project_id}/submissions", json={
        "code_filename": "a.py", "code_content": "print(1)", "variant_id": variant_id,
    })
    assert response.status_code == 201, response.text
    records = client.get(f"/api/answer-history?variant_id={variant_id}").json()["items"]
    assert len(records) == 1
    saved = client.get(f"/api/answer-history/{records[0]['id']}?reveal=true").json()["snapshot"]
    assert saved["question"] == "Original variant prompt"
    assert saved["expected"] == "Original rule"
