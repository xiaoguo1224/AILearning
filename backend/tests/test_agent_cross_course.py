"""Project explore sees every linked course, not just uploaded resources.

A project is an aggregation of courses (project_courses), so a project-level
question is answered from the project's resources AND the lessons of all its
courses. Lessons from courses that are NOT linked stay invisible: the scoping
promise is widened to the project, not dropped.
"""

from app.agent.retrieval import retrieve
from app.db import SessionLocal


def _project(client, name="Cross-course project"):
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def _import_course(client, folder, files):
    payload = {"files": [{"path": f"{folder}/{p}", "content": c} for p, c in files]}
    response = client.post("/api/courses/import", json=payload)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _link(client, project_id, course_id):
    response = client.put(
        f"/api/projects/{project_id}/courses/{course_id}", json={"position": 0}
    )
    assert response.status_code == 200, response.text


def _retrieve(project_id, query):
    session = SessionLocal()
    try:
        return retrieve(session, project_id, query)
    finally:
        session.close()


def test_project_question_sees_linked_course_lessons(client):
    project_id = _project(client)
    course_a = _import_course(
        client,
        "course-a",
        [("01-x/01-attn.md", "# 注意力\n\n## 缩放点积\n\nQK^T 除以根号 dk 防止 softmax 饱和。")],
    )
    course_b = _import_course(
        client,
        "course-b",
        [("01-y/01-opt.md", "# 优化器\n\n## Adam\n\nAdam 结合动量和自适应学习率。")],
    )
    _link(client, project_id, course_a)
    _link(client, project_id, course_b)

    sources = _retrieve(project_id, "为什么 QK^T 要除以根号 dk？")
    lessons = [s for s in sources if s.resource_id == 0]
    assert lessons, "the linked course's lesson should be offered as a source"
    hit = lessons[0]
    assert hit.filename == "course-a"
    assert "注意力" in hit.locator
    assert "根号 dk" in hit.text

    sources_b = _retrieve(project_id, "Adam 优化器有什么特点？")
    assert any(s.resource_id == 0 and s.filename == "course-b" for s in sources_b)


def test_unlinked_course_lessons_stay_invisible(client):
    project_id = _project(client)
    linked = _import_course(
        client, "linked", [("01-x/01-a.md", "# A\n\n## 概念甲\n\n甲的内容。")]
    )
    unlinked = _import_course(
        client, "unlinked", [("01-x/01-b.md", "# B\n\n## 概念乙\n\n乙的内容。")]
    )
    _link(client, project_id, linked)
    assert unlinked  # created but deliberately not linked

    sources = _retrieve(project_id, "概念乙是什么？")
    assert not any(
        s.resource_id == 0 and s.filename == "unlinked" for s in sources
    ), "lessons from courses outside the project must not leak in"


def test_resources_and_lessons_merge(client):
    project_id = _project(client)
    course_id = _import_course(
        client, "m", [("01-x/01-a.md", "# A\n\n## 广播\n\n广播对齐 trailing 维度。")]
    )
    _link(client, project_id, course_id)
    response = client.post(
        f"/api/projects/{project_id}/resources/text",
        json={
            "title": "notes",
            "content": "广播（broadcasting）让形状不同的张量相加。",
            "kind": "markdown",
        },
    )
    assert response.status_code == 201

    sources = _retrieve(project_id, "广播是什么？")
    assert len(sources) <= 5
    kinds = {s.resource_id == 0 for s in sources}
    assert kinds == {True, False}, "both an upload and a lesson should be offered"
    markers = [s.marker for s in sources]
    assert markers == [f"S{i}" for i in range(1, len(sources) + 1)]
