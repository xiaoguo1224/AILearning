from app import models
from app.db import SessionLocal
from app.submissions.models import CodeReview, Submission


def setup_source(client):
    pid = client.post("/api/projects", json={"name": "Course review"}).json()["id"]
    with SessionLocal() as session:
        course = models.Course(title="Tensor shapes", description="")
        module = models.Module(title="Shapes", position=0)
        lesson = models.Lesson(
            title="Matrix multiplication",
            content="A (m,n) @ B (n,p) has shape (m,p).",
            position=0,
            concepts=[],
        )
        course.modules.append(module)
        module.lessons.append(lesson)
        session.add(course)
        session.commit()
        cid, lid = course.id, lesson.id
    client.put(f"/api/projects/{pid}/courses/{cid}", json={"position": 0})
    return pid, lid


def create(client, pid, source, kind="lesson"):
    return client.post(
        f"/api/projects/{pid}/content-reviews", json={"source_kind": kind, "source_id": source}
    )


def test_review_snapshot_requires_explicit_confirmation_and_does_not_change_source(client):
    pid, lid = setup_source(client)
    first = create(client, pid, lid)
    assert first.status_code == 201
    row = first.json()
    assert row["knowledge_status"] == "pending_review"
    assert row["approved"] is False
    assert create(client, pid, lid).json()["id"] == row["id"]
    client.post(f"/api/knowledge/{row['knowledge_id']}/confirm")
    assert create(client, pid, lid).json()["approved"] is True
    with SessionLocal() as session:
        assert session.get(models.Lesson, lid).content == "A (m,n) @ B (n,p) has shape (m,p)."


def test_changed_source_keeps_history_but_loses_original_version_approval(client):
    pid, lid = setup_source(client)
    row = create(client, pid, lid).json()
    client.post(f"/api/knowledge/{row['knowledge_id']}/confirm")
    with SessionLocal() as session:
        session.get(models.Lesson, lid).content = "A corrected lesson."
        session.commit()
    old = client.get(f"/api/projects/{pid}/content-reviews").json()["items"][0]
    assert old["source_unchanged"] is False and old["approved"] is False
    new = create(client, pid, lid).json()
    assert new["id"] != row["id"]
    assert new["knowledge_status"] == "pending_review"


def test_confirming_an_edited_copy_does_not_approve_the_unedited_source(client):
    pid, lid = setup_source(client)
    row = create(client, pid, lid).json()
    client.patch(f"/api/knowledge/{row['knowledge_id']}", json={"body": "A reviewed correction."})
    client.post(f"/api/knowledge/{row['knowledge_id']}/confirm")
    checked = create(client, pid, lid).json()
    assert checked["source_unchanged"] is True
    assert checked["matches_source"] is False and checked["approved"] is False


def test_solutions_must_belong_to_project_and_already_be_revealed(client):
    pid, _ = setup_source(client)
    other = client.post("/api/projects", json={"name": "Other"}).json()["id"]
    with SessionLocal() as session:
        submission = Submission(project_id=pid)
        session.add(submission)
        session.flush()
        review = CodeReview(
            submission_id=submission.id,
            summary="Shape check",
            reference_solution="weights[:, 0:1]",
            findings=[],
        )
        session.add(review)
        session.commit()
        rid = review.id
    assert create(client, other, rid, "solution").status_code == 404
    assert create(client, pid, rid, "solution").status_code == 409
    with SessionLocal() as session:
        session.get(CodeReview, rid).solution_revealed_at = models.utcnow()
        session.commit()
    result = create(client, pid, rid, "solution")
    assert result.status_code == 201
    knowledge = client.get(f"/api/knowledge/{result.json()['knowledge_id']}").json()
    assert knowledge["kind"] == "standard_answer" and knowledge["status"] == "pending_review"


def test_foreign_or_oversized_lessons_are_refused_without_partial_review(client):
    pid, lid = setup_source(client)
    other = client.post("/api/projects", json={"name": "Other"}).json()["id"]
    assert create(client, other, lid).status_code == 404
    with SessionLocal() as session:
        session.get(models.Lesson, lid).content = "x" * 40001
        session.commit()
    assert create(client, pid, lid).status_code == 422
    assert client.get(f"/api/projects/{pid}/knowledge").json()["total"] == 0


def test_binding_failure_rolls_back_the_new_knowledge_copy(client, monkeypatch):
    import pytest

    from app.content_reviews.models import ContentReview

    pid, lid = setup_source(client)
    def fail_binding(*args, **kwargs):
        raise RuntimeError("forced binding failure")
    monkeypatch.setattr(ContentReview, "__init__", fail_binding)
    with pytest.raises(RuntimeError, match="forced binding failure"):
        create(client, pid, lid)
    assert client.get(f"/api/projects/{pid}/knowledge").json()["total"] == 0
    assert client.get(f"/api/projects/{pid}/content-reviews").json()["total"] == 0
