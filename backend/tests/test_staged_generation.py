"""Task API and real generation workflow with a deterministic, offline provider."""

import json
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import pytest

from app import models
from app.db import SessionLocal
from app.jobs import service as jobs
from app.llm.base import LLMResult
from app.staged_gen import service


class Provider:
    name, model, is_paid = "fake", "staged-test", False

    def __init__(self):
        self.calls = []
        self.lock = threading.Lock()
        self.barrier = None
        self.fail_b = False

    def generate(self, system, prompt, max_tokens=64000):
        with self.lock:
            self.calls.append((system, prompt))
        if "curriculum designer" in system:
            return LLMResult(
                json.dumps(
                    {
                        "title": "Approved title",
                        "description": "Description",
                        "modules": [
                            {
                                "title": "Basics",
                                "lessons": [
                                    {"title": "A", "summary": "Alpha"},
                                    {"title": "B", "summary": "Beta"},
                                ],
                            }
                        ],
                    }
                )
            )
        if self.barrier:
            self.barrier.wait(timeout=5)
        if "Lesson title: B" in prompt and self.fail_b:
            raise RuntimeError("private /secret/path API_KEY=must-not-leak")
        return LLMResult(
            json.dumps(
                {
                    "content": "Revised body" if "Apply the learner" in prompt else "Original body",
                    "concepts": ["tensor"],
                    "quiz": [
                        {
                            "question": "Question?",
                            "kind": "short",
                            "options": [],
                            "answer": "Answer",
                            "concept": "tensor",
                        }
                    ],
                }
            )
        )


@pytest.fixture
def provider(monkeypatch):
    provider = Provider()
    monkeypatch.setattr(service, "get_provider", lambda: provider)

    def inline(job_id, fn):
        if jobs._set_status(job_id, "running"):
            fn(job_id)

    monkeypatch.setattr(jobs, "run_in_background", inline)
    return provider


def start(client, mode="full", difficulty=1):
    response = client.post(
        "/api/courses/generation/job",
        json={"topic": "Tensors", "mode": mode, "difficulty": difficulty},
    )
    assert response.status_code == 202, response.text
    return client.get(f"/api/jobs/{response.json()['job_id']}").json()


def decide(client, job, action="approve", feedback=""):
    response = client.post(
        f"/api/courses/generation/{job['id']}/review",
        json={"action": action, "revision": job["progress"]["revision"], "feedback": feedback},
    )
    assert response.status_code == 202, response.text
    return client.get(f"/api/jobs/{job['id']}").json()


def test_trace_persists_every_append_and_api_returns_it(client):
    with SessionLocal() as db:
        job_id = jobs.create_job(db, "trace_test").id
    jobs.append_trace(job_id, {"type": "tool_call", "tool": "first"})
    jobs.append_trace(job_id, {"type": "tool_result", "tool": "first"})
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(
            pool.map(
                lambda i: jobs.append_trace(job_id, {"type": "thinking", "content": str(i)}),
                range(12),
            )
        )
    detail = client.get(f"/api/jobs/{job_id}").json()
    assert len(detail["trace"]["entries"]) == 14
    listing = client.get("/api/jobs?limit=100").json()
    assert next(j for j in listing["items"] if j["id"] == job_id)["trace"] == detail["trace"]
    assert client.get("/api/jobs?limit=1&offset=1").json()["total"] == listing["total"]
    assert client.get("/api/jobs?limit=0").status_code == 422


def test_full_review_outline_revision_parallel_chapters_and_single_revision(client, provider):
    job = start(client, difficulty=2)
    assert job["status"] == "awaiting_review"
    assert len(provider.calls) == 1
    first = job
    job = decide(client, job, "revise", "Add concrete tensor shapes")
    assert "Add concrete tensor shapes" in provider.calls[-1][1]
    assert all("Target difficulty HIGH" in system for system, _ in provider.calls)
    assert (
        client.post(
            f"/api/courses/generation/{job['id']}/review",
            json={"action": "approve", "revision": first["progress"]["revision"]},
        ).status_code
        == 409
    )
    # A sequential implementation deadlocks this barrier and fails the test.
    provider.barrier = threading.Barrier(2)
    job = decide(client, job)
    provider.barrier = None
    assert job["status"] == "awaiting_review"
    assert job["progress"]["stage"] == "lesson_review"
    assert job["progress"]["generated"] == 2
    assert len(provider.calls) == 4  # 2 outline versions + exactly 2 lessons
    assert job["result"] is None
    untouched = job["progress"]["drafts"][1]
    job = decide(client, job, "revise", "Use smaller matrices")
    assert job["progress"]["draft"]["content"] == "Revised body"
    assert job["progress"]["drafts"][1] == untouched
    assert len(provider.calls) == 5
    job = decide(client, job)
    assert job["progress"]["draft"]["title"] == "B"
    assert job["progress"]["done"] == 1
    assert job["result"] is None
    job = decide(client, job)
    assert job["status"] == "completed"
    course = client.get(f"/courses/{job['result']['course_id']}").json()
    assert course["title"] == "Approved title"
    assert [lesson["title"] for module in course["modules"] for lesson in module["lessons"]] == [
        "A",
        "B",
    ]
    with SessionLocal() as db:
        saved = db.get(models.Course, course["id"])
        assert all(lesson.quiz_items for module in saved.modules for lesson in module.lessons)
    assert len(provider.calls) == 5
    entries = job["trace"]["entries"]
    assert sum(entry["type"] == "tool_call" for entry in entries) == 5
    assert sum(entry["type"] == "tool_result" for entry in entries) == 5
    assert "prompt_preview" not in json.dumps(entries)


@pytest.mark.parametrize("mode", ["auto", "outline"])
def test_nonfull_modes_complete_and_keep_quizzes(client, provider, mode):
    job = start(client, mode=mode, difficulty=0)
    if mode == "outline":
        assert len(provider.calls) == 1
        job = decide(client, job)
    assert job["status"] == "completed"
    assert len(provider.calls) == (6 if mode == "auto" else 3)
    assert all("Target difficulty LOW" in system for system, _ in provider.calls)
    with SessionLocal() as db:
        course = db.get(models.Course, job["result"]["course_id"])
        assert len(course.modules[0].lessons) == 2
        assert all(lesson.quiz_items for lesson in course.modules[0].lessons)
        assert db.query(models.LlmCall).filter_by(
            run_id=job["id"], course_id=course.id
        ).count() == len(provider.calls)


def test_waiting_review_survives_restart_cancel_and_late_updates(client, provider):
    job = start(client)
    jobs.mark_interrupted_jobs()
    assert client.get(f"/api/jobs/{job['id']}").json()["status"] == "awaiting_review"
    assert client.post(f"/api/jobs/{job['id']}/cancel").json()["status"] == "cancelled"
    jobs.update_progress(job["id"], {"stage": "late"})
    jobs.complete_job(job["id"], {"course_id": -1})
    assert client.get(f"/api/jobs/{job['id']}").json()["status"] == "cancelled"
    assert (
        client.post(
            f"/api/courses/generation/{job['id']}/review",
            json={"action": "approve", "revision": job["progress"]["revision"]},
        ).status_code
        == 409
    )


def test_partial_failure_retry_only_missing_chapter(client, provider):
    job = start(client, mode="outline")
    provider.fail_b = True
    job = decide(client, job)
    assert job["status"] == "failed"
    assert "secret" not in job["error"]
    assert job["progress"]["generated"] == 1
    assert job["result"] is None
    provider.fail_b = False
    response = client.post(f"/api/courses/generation/{job['id']}/retry")
    assert response.status_code == 202
    job = client.get(f"/api/jobs/{job['id']}").json()
    assert job["status"] == "completed"
    lesson_calls = Counter(
        "A" if "Lesson title: A" in prompt else "B" for _, prompt in provider.calls[1:]
    )
    assert lesson_calls == {"A": 1, "B": 2}


def test_concurrent_approval_only_advances_once(client, provider):
    job = start(client)
    payload = {"action": "approve", "revision": job["progress"]["revision"]}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(
                lambda _: client.post(f"/api/courses/generation/{job['id']}/review", json=payload),
                range(2),
            )
        )
    assert sorted(response.status_code for response in responses) == [202, 409]
    current = client.get(f"/api/jobs/{job['id']}").json()
    assert current["progress"]["stage"] == "lesson_review"
    assert current["progress"]["done"] == 0
    assert len(provider.calls) == 3


def test_save_failure_rolls_back_course_and_retry_saves_once(client, provider, monkeypatch):
    from app import main

    original = main._save_course
    with SessionLocal() as db:
        before = db.query(models.Course).count()

    def fail_save(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("simulated disk error")

    monkeypatch.setattr(main, "_save_course", fail_save)
    job = start(client, mode="auto")
    assert job["status"] == "failed"
    with SessionLocal() as db:
        assert db.query(models.Course).count() == before
    monkeypatch.setattr(main, "_save_course", original)
    assert client.post(f"/api/courses/generation/{job['id']}/retry").status_code == 202
    with SessionLocal() as db:
        assert db.query(models.Course).count() == before + 1
    assert client.post(f"/api/courses/generation/{job['id']}/retry").status_code == 409


@pytest.mark.parametrize(
    "body",
    [
        {"topic": " "},
        {"topic": "x", "difficulty": 3},
        {"topic": "x", "mode": "other"},
        {"topic": "x" * 20001},
    ],
)
def test_invalid_input_rejected_without_provider(client, provider, body):
    assert client.post("/api/courses/generation/job", json=body).status_code == 422
    assert not provider.calls
