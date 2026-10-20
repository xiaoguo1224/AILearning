from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from sqlalchemy import update

from app import models
from app.db import SessionLocal
from app.projects.models import Project, ProjectCourse


def create(client, name="Project"):
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def course():
    with SessionLocal() as session:
        row = models.Course(title=f"Project QA {uuid4().hex}")
        session.add(row)
        session.commit()
        return row.id


def test_project_lifecycle_sharing_and_archive_preserve_history(client):
    first = create(client, "  PyTorch  ")
    second = create(client, "Papers")
    assert first["name"] == "PyTorch" and first["status"] == "active"
    assert first["created_at"].endswith("+00:00")
    course_id = course()
    for project in (first, second):
        url = f"/api/projects/{project['id']}/courses/{course_id}"
        assert client.put(url, json={"position": 2}).status_code == 200
        body = client.put(url, json={"position": 1}).json()
        assert len(body["courses"]) == 1
        assert body["courses"][0]["position"] == 1

    changed = client.patch(
        f"/api/projects/{first['id']}", json={"goal": "Tensor shapes", "mode": "practice"}
    )
    assert changed.status_code == 200 and changed.json()["mode"] == "practice"
    with SessionLocal() as session:
        before = {
            table: session.query(table).count()
            for table in (models.Course, models.Attempt, models.ReviewCard, models.ReviewLog)
        }
    previous_archive = None
    for _ in range(2):
        archived = client.post(f"/api/projects/{first['id']}/archive")
        assert archived.status_code == 200 and archived.json()["status"] == "archived"
        assert archived.json()["courses"][0]["course_id"] == course_id
        if previous_archive is not None:
            assert archived.json() == previous_archive
        previous_archive = archived.json()
    with SessionLocal() as session:
        assert before == {table: session.query(table).count() for table in before}
    for response in (
        client.patch(f"/api/projects/{first['id']}", json={"name": "Changed"}),
        client.put(f"/api/projects/{first['id']}/courses/{course_id}", json={}),
        client.delete(f"/api/projects/{first['id']}/courses/{course_id}"),
    ):
        assert response.status_code == 409
        assert response.json()["detail"]["error"] == "project_archived"
    assert client.get(f"/api/projects/{first['id']}").status_code == 200
    active = client.get("/api/projects").json()
    archived_list = client.get("/api/projects?status=archived").json()
    assert second["id"] in {p["id"] for p in active["items"]}
    assert first["id"] in {p["id"] for p in archived_list["items"]}
    assert (
        client.delete(f"/api/projects/{second['id']}/courses/{course_id}").json()["courses"] == []
    )
    assert client.delete(f"/api/projects/{second['id']}/courses/{course_id}").status_code == 200
    assert client.get(f"/courses/{course_id}").status_code == 200


def test_course_deletion_cleans_all_memberships_and_id_reuse(client):
    projects = [create(client), create(client)]
    course_id = course()
    for project in projects:
        assert (
            client.put(f"/api/projects/{project['id']}/courses/{course_id}", json={}).status_code
            == 200
        )
    assert client.delete(f"/courses/{course_id}").status_code == 200
    with SessionLocal() as session:
        assert session.query(ProjectCourse).filter_by(course_id=course_id).count() == 0
        session.add(models.Course(id=course_id, title="Reused ID"))
        session.commit()
    for project in projects:
        assert client.get(f"/api/projects/{project['id']}").json()["courses"] == []


@pytest.mark.parametrize(
    "body",
    [
        {"name": " "},
        {"name": "x" * 201},
        {"name": None},
        {"name": "ok", "status": "archived"},
        {"name": "ok", "mode": "invalid"},
        {"name": "ok", "goal": "x" * 5001},
    ],
)
def test_create_rejects_invalid_input(client, body):
    assert client.post("/api/projects", json=body).status_code == 422


@pytest.mark.parametrize(
    "body", [{}, {"name": None}, {"mode": None}, {"goal": None}, {"unknown": 1}]
)
def test_patch_rejects_invalid_input(client, body):
    project = create(client)
    assert client.patch(f"/api/projects/{project['id']}", json=body).status_code == 422


@pytest.mark.parametrize("position", [True, -1, 0.5, "1", 2_147_483_648])
def test_membership_position_is_a_bounded_integer(client, position):
    project = create(client)
    assert (
        client.put(
            f"/api/projects/{project['id']}/courses/1", json={"position": position}
        ).status_code
        == 422
    )


def test_missing_entities_pagination_and_local_origin(client):
    project = create(client)
    assert client.get("/api/projects/2147483647").status_code == 404
    assert client.post("/api/projects/2147483647/archive").status_code == 404
    missing = client.put(f"/api/projects/{project['id']}/courses/2147483647", json={})
    assert missing.status_code == 404
    assert missing.json()["detail"]["error"] == "course_not_found"
    for query in ("limit=101", "offset=-1", "status=invalid"):
        assert client.get(f"/api/projects?{query}").status_code == 422
    page = client.get("/api/projects?limit=1").json()
    assert len(page["items"]) == 1 and page["total"] >= 1
    response = client.post(
        "/api/projects", json={"name": "Denied"}, headers={"Origin": "https://untrusted.invalid"}
    )
    assert response.status_code == 403
    assert (
        client.post(
            "/api/projects", json={"name": "Allowed"}, headers={"Origin": "http://localhost:3000"}
        ).status_code
        == 201
    )


def test_archive_write_lock_rechecks_status_before_membership(client):
    project = create(client)
    course_id = course()
    with SessionLocal() as archiver, ThreadPoolExecutor(max_workers=1) as pool:
        archiver.execute(
            update(Project).where(Project.id == project["id"]).values(status="archived")
        )
        future = pool.submit(
            client.put, f"/api/projects/{project['id']}/courses/{course_id}", json={}
        )
        archiver.commit()
        response = future.result(timeout=10)
    assert response.status_code == 409
    assert client.get(f"/api/projects/{project['id']}").json()["courses"] == []
