import pytest

from app.db import SessionLocal
from app.knowledge.models import ErrorCause
from app.suggestions import service


def setup_suggestion(client):
    source = client.post("/api/projects", json={"name": "Paper"}).json()["id"]
    target = client.post("/api/projects", json={"name": "PyTorch"}).json()["id"]
    error = client.post(f"/api/projects/{source}/errors", json={"concept_key": "matrix multiplication", "cause": "procedure", "note": "Operands reversed"}).json()["id"]
    return source, target, error


def create(client, source, target, error):
    return client.post(f"/api/projects/{source}/suggestions", json={"source_error_id": error, "target_project_id": target})


def decide(client, row, decision):
    return client.post(f"/api/suggestions/{row['id']}/decision", json={"decision": decision})


def target_snapshot(client, target):
    from app import models
    with SessionLocal() as session:
        fsrs_counts = session.query(models.ReviewCard).count(), session.query(models.ReviewLog).count()
    return (client.get(f"/api/projects/{target}").json(),
            client.get(f"/api/projects/{target}/errors", params={"open": False}).json(),
            client.get(f"/api/projects/{target}/knowledge").json(), fsrs_counts)


def test_pending_and_rejection_leave_the_entire_target_unchanged(client):
    source, target, error = setup_suggestion(client)
    client.post(f"/api/projects/{target}/knowledge", json={"title": "Existing", "body": "Keep this"})
    before = target_snapshot(client, target)
    response = create(client, source, target, error)
    assert response.status_code == 201
    row = response.json()
    assert row["state"] == "pending" and row["target_error_id"] is None
    assert target_snapshot(client, target) == before
    rejected = decide(client, row, "rejected")
    assert rejected.status_code == 200
    assert rejected.json()["decided_at"] is not None
    assert target_snapshot(client, target) == before
    assert decide(client, row, "rejected").json() == rejected.json()
    assert decide(client, row, "accepted").status_code == 409
    assert target_snapshot(client, target) == before


def test_acceptance_is_atomic_and_idempotent(client):
    source, target, error = setup_suggestion(client)
    row = create(client, source, target, error).json()
    assert create(client, source, target, error).json()["id"] == row["id"]
    accepted = decide(client, row, "accepted")
    assert accepted.status_code == 200
    result = accepted.json()
    assert result["state"] == "accepted"
    with SessionLocal() as session:
        created = session.get(ErrorCause, result["target_error_id"])
        assert created.project_id == target
        assert created.concept_key == row["concept_key"]
        assert "Operands reversed" in created.detail
        assert "cross-project" in created.note
    after = target_snapshot(client, target)
    assert decide(client, row, "accepted").json() == result
    assert target_snapshot(client, target) == after
    assert client.get(f"/api/projects/{target}/review-tasks").json()["total"] == 1
    assert decide(client, row, "rejected").status_code == 409


def test_archived_target_refuses_acceptance_but_allows_rejection(client):
    source, target, error = setup_suggestion(client)
    row = create(client, source, target, error).json()
    client.post(f"/api/projects/{target}/archive")
    before = target_snapshot(client, target)
    assert decide(client, row, "accepted").status_code == 409
    listing = client.get(f"/api/projects/{source}/suggestions").json()
    assert listing["items"][0]["state"] == "pending"
    assert target_snapshot(client, target) == before
    assert decide(client, row, "rejected").status_code == 200


def test_failed_acceptance_rolls_back_the_target_and_decision(client, monkeypatch):
    source, target, error = setup_suggestion(client)
    row = create(client, source, target, error).json()
    before = target_snapshot(client, target)
    original = service.errors.record
    def fail_after_insert(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("forced after target insertion")
    monkeypatch.setattr(service.errors, "record", fail_after_insert)
    with pytest.raises(RuntimeError, match="forced"):
        decide(client, row, "accepted")
    assert target_snapshot(client, target) == before
    assert client.get(f"/api/projects/{source}/suggestions").json()["items"][0]["state"] == "pending"


def test_suggestion_source_cannot_be_forged_or_retargeted_to_itself(client):
    source, target, error = setup_suggestion(client)
    assert create(client, target, source, error).status_code == 404
    assert create(client, source, source, error).status_code == 422
    client.post(f"/api/errors/{error}/dismiss")
    assert create(client, source, target, error).status_code == 409


def test_concurrent_acceptance_creates_one_target_task(client):
    from concurrent.futures import ThreadPoolExecutor
    source, target, error = setup_suggestion(client)
    row = create(client, source, target, error).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: decide(client, row, "accepted"), range(2)))
    assert [result.status_code for result in results] == [200, 200]
    assert results[0].json()["target_error_id"] == results[1].json()["target_error_id"]
    assert client.get(f"/api/projects/{target}/errors").json()["total"] == 1


def test_a_new_mistake_does_not_reopen_an_old_suggestion_source(client):
    from datetime import UTC, datetime, timedelta

    from app import review
    source, target, error = setup_suggestion(client)
    row = create(client, source, target, error).json()
    with SessionLocal() as session:
        review.record_review(session, row["concept_key"], "Matrix multiplication", 3, now=datetime.now(UTC) + timedelta(seconds=1))
        session.add(ErrorCause(project_id=source, concept_key=row["concept_key"], concept_label="Matrix multiplication", cause="notation", source_kind="manual", created_at=datetime.now(UTC) + timedelta(seconds=2)))
        session.commit()
    assert client.get(f"/api/projects/{source}/review-tasks").json()["total"] == 1
    before = target_snapshot(client, target)
    assert decide(client, row, "accepted").status_code == 409
    assert target_snapshot(client, target) == before
