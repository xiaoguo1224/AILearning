"""Question-scoped code submissions: answering a code quiz question reuses the
submission/review pipeline, but the submission belongs to the question
(project_id NULL) rather than to a project."""

import json


def _seed_code_question():
    from app import models
    from app.db import SessionLocal

    with SessionLocal() as session:
        course = models.Course(title="t")
        session.add(course)
        session.flush()
        module = models.Module(course_id=course.id, title="m", position=0)
        session.add(module)
        session.flush()
        lesson = models.Lesson(
            module_id=module.id, title="l", content="x", position=0
        )
        session.add(lesson)
        session.flush()
        item = models.QuizItem(
            lesson_id=lesson.id,
            kind="code",
            question="Write a function that adds two numbers.",
            answer="def add(a, b): return a + b",
            options=None,
        )
        session.add(item)
        session.commit()
        return item.id


def test_question_submission_creates_versions(client):
    item_id = _seed_code_question()
    for n in (1, 2):
        response = client.post(
            f"/api/quiz/{item_id}/submissions",
            json={"code": f"def add(a, b):\n    return a + b  # v{n}"},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["version"] == n
        assert body["quiz_item_id"] == item_id
        assert body["project_id"] is None
        assert body["status"] == "submitted"

    history = client.get(f"/api/quiz/{item_id}/submissions").json()
    assert history["total"] == 2
    assert [i["version"] for i in history["items"]] == [2, 1]
    assert all(i["project_id"] is None for i in history["items"])


def test_question_submission_validates(client):
    assert client.post("/api/quiz/999999/submissions", json={"code": "x"}).status_code == 404
    assert client.get("/api/quiz/999999/submissions").status_code == 404

    item_id = _seed_code_question()
    # Empty code is refused.
    assert (
        client.post(f"/api/quiz/{item_id}/submissions", json={"code": "  "}).status_code == 422
    )


def test_question_submission_accepts_log_and_upload(client):
    item_id = _seed_code_question()
    # Pasted code + pasted log.
    body = client.post(
        f"/api/quiz/{item_id}/submissions",
        json={"code": "def add(a, b):\n    return a + b", "log_content": "ok"},
    ).json()
    assert body["version"] == 1
    detail = client.get(f"/api/submissions/{body['id']}").json()
    kinds = sorted(a["kind"] for a in detail["artifacts"])
    assert kinds == ["code", "log"]

    # File upload: code file + log file.
    response = client.post(
        f"/api/quiz/{item_id}/submissions/upload",
        files={
            "code_file": ("answer.py", b"def add(a, b):\n    return a + b", "text/x-python"),
            "log_file": ("run.log", b"Traceback: boom", "text/plain"),
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["version"] == 2
    assert body["quiz_item_id"] == item_id
    detail = client.get(f"/api/submissions/{body['id']}").json()
    kinds = sorted(a["kind"] for a in detail["artifacts"])
    assert kinds == ["code", "log"]


def test_question_review_runs_without_project(client):
    item_id = _seed_code_question()
    submission_id = client.post(
        f"/api/quiz/{item_id}/submissions", json={"code": "def add(a, b):\n    return a + b"}
    ).json()["id"]
    # Static-only review: no project write lock to take, no LLM needed.
    response = client.post(f"/api/submissions/{submission_id}/review")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["submission_id"] == submission_id
    detail = client.get(f"/api/submissions/{submission_id}").json()
    assert detail["status"] == "reviewed"
    assert detail["quiz_item_id"] == item_id
