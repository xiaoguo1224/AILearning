"""Course-level reference materials (资料), mirroring project resources.

A course owns its reference material the way a project does: the project is a
container, the course is where learning happens, so this is where the
materials a learner cites live. Course Q&A grounds in them (see the tutor
tests below); these endpoints are the management half.
"""

import io


def _course(client, title="Materials course"):
    response = client.post("/api/courses/import", json={"files": [{"path": "m/01.md", "content": "# M\n\ntext"}]})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _add_text(client, course_id, title="注意力论文笔记", content="缩放点积注意力用根号 dk 缩放。"):
    response = client.post(
        f"/api/courses/{course_id}/resources/text",
        json={"title": title, "content": content, "kind": "markdown"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_text_resource_lifecycle(client):
    course_id = _course(client)
    created = _add_text(client, course_id)
    assert created["parse_status"] == "completed"
    assert created["filename"] == "注意力论文笔记"

    listed = client.get(f"/api/courses/{course_id}/resources").json()
    assert [r["id"] for r in listed] == [created["id"]]

    found = client.get(
        f"/api/courses/{course_id}/resources/search", params={"q": "缩放点积"}
    ).json()
    assert any(r["resource_id"] == created["id"] for r in found)

    deleted = client.delete(
        f"/api/courses/{course_id}/resources/{created['id']}"
    ).json()
    assert deleted["status"] == "success"
    assert client.get(f"/api/courses/{course_id}/resources").json() == []


def test_upload_resource(client):
    course_id = _course(client)
    response = client.post(
        f"/api/courses/{course_id}/resources/upload",
        files={"file": ("notes.md", io.BytesIO("## 笔记\n\n内容".encode()), "text/markdown")},
    )
    assert response.status_code == 201, response.text
    assert response.json()["filename"] == "notes.md"


def test_resources_are_scoped_to_their_course(client):
    course_a = _course(client, "A")
    course_b = _course(client, "B")
    created = _add_text(client, course_a, content="只属于 A 课程的独特内容甲乙丙。")

    assert client.get(f"/api/courses/{course_b}/resources").json() == []
    found_b = client.get(
        f"/api/courses/{course_b}/resources/search", params={"q": "独特内容甲乙丙"}
    ).json()
    assert not any(r["resource_id"] == created["id"] for r in found_b)

    assert client.get("/api/courses/999999/resources").status_code == 404
    assert (
        client.post("/api/courses/999999/resources/text", json={"title": "x", "content": "y", "kind": "text"}).status_code
        == 404
    )


def test_tutor_grounds_in_course_materials(client, monkeypatch):
    """A course-scoped question searches the course's 资料; the tutor's refs can
    cite a reference file as 资料：filename."""
    import json as _json

    from app import main, tutor
    from app.llm.base import LLMResult

    course_id = _course(client)
    created = _add_text(
        client, course_id, title="论文笔记.md", content="缩放点积注意力：QK^T 除以根号 dk。"
    )

    # The question grounds in the course's material.
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        context = tutor.context(session, f"course:{course_id}", question="为什么除以根号 dk？")
    finally:
        session.close()
    assert any(h["filename"] == "论文笔记.md" for h in context.resource_hits)
    block = tutor._material_block(context)
    assert "Reference material: 论文笔记.md" in block
    assert "根号 dk" in block

    # The model can cite it, and the citation resolves to a resource ref.
    reply = tutor.parse_reply(
        _json.dumps({"answer": "见资料。", "refs": ["资料：论文笔记.md"]}),
        tutor.MODE_ANSWER,
        lessons=[],
        resources=[{"filename": "论文笔记.md"}],
    )
    assert reply.refs == [{"lesson_id": None, "title": "论文笔记.md"}]
    # An invented filename is dropped, not guessed at.
    reply2 = tutor.parse_reply(
        _json.dumps({"answer": "见资料。", "refs": ["资料：不存在.md"]}),
        tutor.MODE_ANSWER,
        lessons=[],
        resources=[{"filename": "论文笔记.md"}],
    )
    assert reply2.refs == []

    # End to end: the tutor message carries the resource ref.
    class Provider:
        name = "fake"
        model = "stub"
        is_paid = False

        def generate(self, system, prompt, max_tokens=64000):
            assert "Reference material: 论文笔记.md" in prompt
            return LLMResult(
                text=_json.dumps({"answer": "因为缩放。", "refs": ["资料：论文笔记.md"]}),
                input_tokens=1,
                output_tokens=1,
            )

    monkeypatch.setattr(main, "get_provider", lambda: Provider())
    response = client.post(
        "/tutor/messages",
        json={"concept_key": f"course:{course_id}", "message": "为什么除以根号 dk？"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["reply"]["refs"] == [{"lesson_id": None, "title": "论文笔记.md"}]
    assert created  # the material existed for the whole turn


def test_lesson_scoped_tutor_grounds_in_that_lesson(client, monkeypatch):
    """lesson:{id} Q&A: grounds in the one lesson, labels it, meters its course."""
    import json as _json

    from app import main, models, tutor
    from app.db import SessionLocal
    from app.llm.base import LLMResult

    course_id = _course(client)
    session = SessionLocal()
    try:
        lesson = (
            session.query(models.Lesson)
            .join(models.Module)
            .filter(models.Module.course_id == course_id)
            .first()
        )
        lesson_id = lesson.id
        lesson_title = lesson.title
        module_course = (
            session.get(models.Module, lesson.module_id).course_id
        )
    finally:
        session.close()
    assert module_course == course_id

    session = SessionLocal()
    try:
        context = tutor.context(session, f"lesson:{lesson_id}", question="这节讲什么？")
    finally:
        session.close()
    assert [l.id for l in context.lessons] == [lesson_id]
    assert context.concept_label == lesson_title

    class Provider:
        name = "fake"
        model = "stub"
        is_paid = False

        def generate(self, system, prompt, max_tokens=64000):
            return LLMResult(
                text=_json.dumps({"answer": "这节讲注意力。", "refs": []}),
                input_tokens=1,
                output_tokens=1,
            )

    monkeypatch.setattr(main, "get_provider", lambda: Provider())
    response = client.post(
        "/tutor/messages",
        json={"concept_key": f"lesson:{lesson_id}", "message": "这节讲什么？"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["concept_label"] == lesson_title
    assert body["reply"]["answer"] == "这节讲注意力。"

    # A missing lesson is no_material, not a 500.
    response = client.post(
        "/tutor/messages",
        json={"concept_key": "lesson:999999", "message": "hi"},
    )
    assert response.status_code == 422
