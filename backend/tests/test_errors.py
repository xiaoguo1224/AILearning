"""P4-04 acceptance: a mistake maps to a knowledge point, and to a queue — never to FSRS.

The rule worth the most here is the one that is easiest to break by accident: nothing in
this path may move a review card. A schedule is a model of memory, and the only evidence
that memory moved is a retrieval the learner performed; a diagnosis is a hypothesis about
why one failed. These tests hold that line, then check the mapping, the grouping and the
two ways a queue entry closes.
"""

import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from app import models, review
from app.db import SessionLocal
from app.knowledge.models import ErrorCause


def _project(client, name="Diagnosis Project"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def _entry(client, project_id, *, title="Matrix multiplication shapes", concept="matrix shapes", **kw):
    payload = {
        "title": title,
        "body": "Inner dimensions must match; the result is (rows of A, columns of B).",
        "kind": "definition",
        "concept_key": concept,
    }
    payload.update(kw)
    return client.post(f"/api/projects/{project_id}/knowledge", json=payload).json()


def _record(client, project_id, **payload):
    body = {"cause": "concept_gap", "note": "used the wrong operand order"}
    body.update(payload)
    return client.post(f"/api/projects/{project_id}/errors", json=body)


def _tasks(client, project_id):
    return client.get(f"/api/projects/{project_id}/review-tasks").json()


def _card(concept_key):
    session = SessionLocal()
    try:
        return review.get_card(session, concept_key)
    finally:
        session.close()


def test_a_diagnosis_maps_itself_to_the_entry_for_that_concept(client):
    project_id = _project(client)
    entry = _entry(client, project_id)

    response = _record(client, project_id, concept_key="Matrix Shapes.")
    assert response.status_code == 201
    body = response.json()

    # The key is normalized on the way in, so "Matrix Shapes." finds the same entry.
    assert body["concept_key"] == "matrix shapes"
    assert body["knowledge_id"] == entry["id"]
    # The label falls back to the entry's title rather than the normalized key, which is
    # lowercase text the learner never wrote.
    assert body["concept_label"] == entry["title"]
    assert body["dismissed_at"] is None


def test_a_confirmed_entry_wins_over_a_draft_for_the_same_concept(client):
    project_id = _project(client)
    draft = _entry(client, project_id, title="A draft guess", concept="eigenvalues", kind="note")
    settled = _entry(client, project_id, title="A settled definition", concept="eigenvalues")
    client.post(f"/api/knowledge/{settled['id']}/confirm")

    mapped = _record(client, project_id, concept_key="eigenvalues").json()
    assert mapped["knowledge_id"] == settled["id"]
    assert mapped["knowledge_id"] != draft["id"]


def test_a_diagnosis_with_no_entry_is_kept_and_says_so(client):
    project_id = _project(client)
    created = _record(client, project_id, concept_key="tensor broadcasting").json()
    assert created["knowledge_id"] is None

    tasks = _tasks(client, project_id)
    assert tasks["total"] == 1
    # A mistake with nowhere to live is the clearest statement that a note is missing, so
    # it is a normal value here rather than an error.
    assert tasks["items"][0]["knowledge_id"] is None
    assert tasks["items"][0]["knowledge_title"] is None
    assert tasks["items"][0]["concept_label"] == "tensor broadcasting"


def test_recording_a_diagnosis_does_not_touch_the_review_card(client):
    project_id = _project(client)
    moment = datetime.now(UTC) - timedelta(hours=1)
    session = SessionLocal()
    try:
        review.record_review(session, "backprop", "Backprop", 1, now=moment)
        session.commit()
    finally:
        session.close()

    before = _card("backprop")
    snapshot = (
        before.state,
        before.stability,
        before.difficulty,
        before.due,
        before.reps,
        before.lapses,
        before.step,
    )

    _record(client, project_id, concept_key="backprop", cause="procedure")

    after = _card("backprop")
    assert (
        after.state,
        after.stability,
        after.difficulty,
        after.due,
        after.reps,
        after.lapses,
        after.step,
    ) == snapshot

    # The queue shows the card's state as a fact, and the fact is still "due long ago".
    task = _tasks(client, project_id)["items"][0]
    assert task["card"]["state"] == "learning"
    assert task["card"]["is_due"] is True


def test_a_task_closes_only_when_a_review_follows_the_diagnosis(client):
    project_id = _project(client)
    # A retrieval that happened BEFORE the diagnosis says nothing about it.
    session = SessionLocal()
    try:
        review.record_review(
            session, "quorum reads", "Quorum reads", 3, now=datetime.now(UTC) - timedelta(minutes=10)
        )
        session.commit()
    finally:
        session.close()

    _record(client, project_id, concept_key="quorum reads")
    assert _tasks(client, project_id)["total"] == 1

    session = SessionLocal()
    try:
        review.record_review(
            session, "quorum reads", "Quorum reads", 3, now=datetime.now(UTC) + timedelta(seconds=1)
        )
        session.commit()
    finally:
        session.close()

    # Closed by evidence rather than by a click: the learner actually did the retrieval.
    assert _tasks(client, project_id)["total"] == 0

    # A mistake recorded after that review opens the queue again, because the old
    # retrieval says nothing about the thing that just went wrong.
    session = SessionLocal()
    try:
        session.add(
            ErrorCause(
                project_id=project_id,
                concept_key="quorum reads",
                concept_label="Quorum reads",
                cause="misread",
                source_kind="manual",
                created_at=datetime.now(UTC) + timedelta(minutes=2),
            )
        )
        session.commit()
    finally:
        session.close()

    reopened = _tasks(client, project_id)
    assert reopened["total"] == 1
    assert reopened["items"][0]["open_errors"] == 1
    assert reopened["items"][0]["latest_cause"] == "misread"


def test_dismissing_removes_the_task_but_keeps_it_in_the_counts(client):
    project_id = _project(client)
    created = _record(client, project_id, concept_key="cache invalidation").json()

    dismissed = client.post(f"/api/errors/{created['id']}/dismiss")
    assert dismissed.status_code == 200
    assert dismissed.json()["dismissed_at"] is not None
    assert _tasks(client, project_id)["total"] == 0

    open_list = client.get(f"/api/projects/{project_id}/errors").json()
    assert open_list["total"] == 0
    # Dismissing says "do not chase this", not "this did not happen".
    assert open_list["cause_counts"] == {"concept_gap": 1}

    everything = client.get(f"/api/projects/{project_id}/errors", params={"open": "false"}).json()
    assert everything["total"] == 1

    # Dismissing twice is the same as dismissing once.
    again = client.post(f"/api/errors/{created['id']}/dismiss")
    assert again.json()["dismissed_at"] == dismissed.json()["dismissed_at"]


def _lesson_with_attempt(correct: bool = False):
    """A course with one short-answer item and one recorded attempt."""
    session = SessionLocal()
    try:
        course = models.Course(title="Linear algebra", description="")
        module = models.Module(title="Module 1", position=0)
        lesson = models.Lesson(title="Shapes", position=0, content="# Shapes", concepts=["shapes"])
        item = models.QuizItem(
            question="What shape is A @ B for A (3, 4) and B (4, 2)?",
            kind="short",
            options=[],
            answer="(3, 2)",
            concept="shapes",
        )
        lesson.quiz_items.append(item)
        module.lessons.append(lesson)
        course.modules.append(module)
        session.add(course)
        session.flush()
        attempt = models.Attempt(
            quiz_item_id=item.id,
            lesson_id=lesson.id,
            concept_key="shapes",
            concept_label="Shapes",
            submitted_answer="(4, 4)" if not correct else "(3, 2)",
            expected_answer="(3, 2)",
            correct=correct,
            attempt_no=1,
        )
        session.add(attempt)
        session.commit()
        return course.id, attempt.id
    finally:
        session.close()


def test_a_wrong_attempt_is_diagnosed_with_its_own_concept(client):
    project_id = _project(client)
    course_id, attempt_id = _lesson_with_attempt()
    client.put(f"/api/projects/{project_id}/courses/{course_id}", json={"position": 0})

    response = client.post(
        f"/api/projects/{project_id}/errors/from-attempt",
        json={"attempt_id": attempt_id, "cause": "procedure", "note": "transposed the result"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["concept_key"] == "shapes"
    assert body["source_kind"] == "attempt"
    assert body["source_id"] == attempt_id
    # The evidence is snapshotted: the attempt row dies with its course, the diagnosis does not.
    assert "submitted: (4, 4)" in body["detail"]
    assert "expected: (3, 2)" in body["detail"]


def test_an_answer_that_was_right_has_nothing_to_diagnose(client):
    project_id = _project(client)
    course_id, attempt_id = _lesson_with_attempt(correct=True)
    client.put(f"/api/projects/{project_id}/courses/{course_id}", json={"position": 0})

    response = client.post(
        f"/api/projects/{project_id}/errors/from-attempt", json={"attempt_id": attempt_id}
    )
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "attempt_was_correct"


def test_an_attempt_from_a_course_outside_the_project_is_refused(client):
    project_id = _project(client)
    _, attempt_id = _lesson_with_attempt()

    response = client.post(
        f"/api/projects/{project_id}/errors/from-attempt", json={"attempt_id": attempt_id}
    )
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "attempt_not_in_project"


def test_an_archived_project_takes_no_new_diagnoses(client):
    project_id = _project(client)
    _record(client, project_id, concept_key="before archiving")
    assert client.post(f"/api/projects/{project_id}/archive").status_code in (200, 204)

    response = _record(client, project_id, concept_key="after archiving")
    assert response.status_code == 409
    assert response.json()["detail"]["error"] == "project_archived"
    # The queue from before the archive is still readable: an archive freezes writes.
    assert _tasks(client, project_id)["total"] == 1


def test_a_diagnosis_needs_a_concept_or_an_entry(client):
    project_id = _project(client)
    response = _record(client, project_id, cause="procedure")
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "empty_concept"

    entry = _entry(client, project_id, concept="linear maps")
    by_entry = _record(client, project_id, knowledge_id=entry["id"], cause="procedure").json()
    # The concept comes from the entry, so the caller does not have to know the key.
    assert by_entry["concept_key"] == "linear maps"


@pytest.mark.parametrize("cause", ["unknown", "Concept_Gap", ""])
def test_an_unknown_cause_is_refused(client, cause):
    project_id = _project(client)
    response = _record(client, project_id, concept_key="anything", cause=cause)
    assert response.status_code == 422


def test_the_same_concept_groups_into_one_task_with_a_cause_breakdown(client):
    project_id = _project(client)
    _record(client, project_id, concept_key="shapes", cause="notation")
    _record(client, project_id, concept_key="shapes", cause="notation")
    _record(client, project_id, concept_key="shapes", cause="concept_gap")
    _record(client, project_id, concept_key="other thing", cause="tooling")

    tasks = _tasks(client, project_id)
    assert tasks["total"] == 2
    grouped = next(item for item in tasks["items"] if item["concept_key"] == "shapes")
    assert grouped["open_errors"] == 3
    assert grouped["causes"] == [
        {"cause": "notation", "count": 2},
        {"cause": "concept_gap", "count": 1},
    ]


def test_reading_the_queue_writes_nothing(client):
    project_id = _project(client)
    _record(client, project_id, concept_key="idempotent reads")
    session: Session = SessionLocal()
    try:
        before = session.query(models.ReviewCard).count(), session.query(models.ReviewLog).count()
    finally:
        session.close()

    _tasks(client, project_id)
    _tasks(client, project_id)

    session = SessionLocal()
    try:
        after = session.query(models.ReviewCard).count(), session.query(models.ReviewLog).count()
    finally:
        session.close()
    assert after == before


def test_manual_diagnoses_cannot_forge_verified_evidence_or_mismatch_concepts(client):
    project_id = _project(client)
    entry = _entry(client, project_id)
    for source in ("attempt", "submission"):
        response = _record(client, project_id, concept_key="shapes", source_kind=source, source_id=1)
        assert response.status_code == 422
        assert response.json()["detail"]["error"] == "unverified_source"
    response = _record(client, project_id, knowledge_id=entry["id"], concept_key="another concept")
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "concept_mismatch"
    assert _tasks(client, project_id)["total"] == 0


def test_an_again_rating_keeps_the_diagnosis_open(client):
    project_id = _project(client)
    _record(client, project_id, concept_key="shapes")
    with SessionLocal() as session:
        review.record_review(session, "shapes", "Shapes", 1, now=datetime.now(UTC) + timedelta(seconds=1))
        session.commit()
    assert _tasks(client, project_id)["total"] == 1


def test_review_evidence_is_server_owned_and_scoped_to_the_project(client):
    from app.submissions.models import CodeReview, Submission

    project_id = _project(client)
    with SessionLocal() as session:
        submission = Submission(project_id=project_id)
        session.add(submission)
        session.flush()
        finding = {"severity": "warning", "evidence_type": "inferred", "description": "Shape mismatch", "file": "main.py", "line_start": 4}
        row = CodeReview(submission_id=submission.id, summary="Shape warning", findings=[finding])
        session.add(row); session.commit()
        review_id, submission_id = row.id, submission.id
    path = f"/api/projects/{project_id}/errors/from-review"
    payload = {"review_id": review_id, "finding_index": 0, "concept_key": "matrix shapes"}
    result = client.post(path, json=payload)
    assert result.status_code == 201
    assert result.json()["source_id"] == submission_id
    assert json.loads(result.json()["detail"])["finding"] == finding
    assert client.post(path, json={**payload, "detail": "forged"}).status_code == 422
    assert client.post(path, json={**payload, "finding_index": 99}).status_code == 422
    other = _project(client, "Other")
    assert client.post(f"/api/projects/{other}/errors/from-review", json=payload).status_code == 404
    with SessionLocal() as session:
        row = session.get(CodeReview, review_id)
        row.findings = [{**finding, "evidence_type": "needs_local_check"}]
        session.commit()
    assert client.post(path, json=payload).status_code == 422


def test_project_practice_ignores_due_dates_and_never_uses_other_project_questions(client):
    project_id = _project(client)
    own_course, _ = _lesson_with_attempt()
    foreign_course, _ = _lesson_with_attempt()
    with SessionLocal() as session:
        review.record_review(session, "shapes", "Shapes", 3, now=datetime.now(UTC) - timedelta(days=1))
        card = session.query(models.ReviewCard).filter_by(concept_key="shapes").one()
        card.due = datetime.now(UTC) + timedelta(days=90)
        foreign_item = session.query(models.QuizItem).join(models.Lesson).join(models.Module).filter(models.Module.course_id == foreign_course).one()
        foreign_item.question = "Another project's question"
        session.commit()
    _record(client, project_id, concept_key="shapes")
    path = f"/api/projects/{project_id}/review-tasks/practice?concept=shapes"
    # A global card and another project's question are not enough.
    assert client.get(path).json()["cards"] == []
    client.put(f"/api/projects/{project_id}/courses/{own_course}", json={"position": 0})
    queue = client.get(path).json()
    assert len(queue["cards"]) == 1
    assert queue["cards"][0]["item"]["question"].startswith("What shape")
    card_id = queue["cards"][0]["card_id"]
    item_id = queue["cards"][0]["item"]["id"]
    answered = client.post(f"/review/cards/{card_id}/answer", json={"item_id": item_id, "answer": "(3, 2)"})
    assert answered.status_code == 200
    assert _tasks(client, project_id)["total"] == 1
    rated = client.post(f"/review/cards/{card_id}/rate", json={"rating": 3, "attempt_ids": [answered.json()["attempt_id"]]})
    assert rated.status_code == 200
    assert _tasks(client, project_id)["total"] == 0


def test_no_card_practice_is_read_only(client):
    project_id = _project(client)
    _record(client, project_id, concept_key="new concept")
    path = f"/api/projects/{project_id}/review-tasks/practice?concept=new%20concept"
    with SessionLocal() as session:
        before = session.query(models.ReviewCard).count(), session.query(models.ReviewLog).count()
    assert client.get(path).json()["cards"] == []
    with SessionLocal() as session:
        assert before == (session.query(models.ReviewCard).count(), session.query(models.ReviewLog).count())
