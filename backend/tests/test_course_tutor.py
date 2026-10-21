"""Course-scoped tutor (concept_key "course:{id}") and lesson citations."""

import json


def _seed_course(client, monkeypatch):
    from app import main
    from app.llm.fake_provider import FakeProvider

    monkeypatch.setattr(main, "get_provider", lambda: FakeProvider())
    response = client.post(
        "/courses/generate",
        json={"text": "transformer attention is all you need " * 60},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_course_scope_parses():
    from app.concepts import course_scope, normalize_concept

    assert course_scope(normalize_concept("course:104")) == 104
    assert course_scope("course:abc") is None
    assert course_scope("course:0") is None
    assert course_scope("broadcasting") is None
    assert course_scope("") is None


def test_course_conversation_grounds_in_whole_course(client, monkeypatch):
    from app import main, models, remediation, tutor
    from app.db import SessionLocal

    course_id = _seed_course(client, monkeypatch)
    with SessionLocal() as session:
        lessons, items = remediation.concept_material(session, f"course:{course_id}")
        assert len(lessons) > 0
        context = tutor.context(session, f"course:{course_id}")
        course = session.get(models.Course, course_id)
        assert context.concept_label == course.title
        assert len(context.lessons) == len(lessons)


def test_course_key_for_missing_course_has_no_material(client):
    from app import remediation

    from app.db import SessionLocal

    with SessionLocal() as session:
        lessons, items = remediation.concept_material(session, "course:999999")
        assert lessons == [] and items == []


def test_tutor_post_accepts_course_key(client, monkeypatch):
    from app import main
    from app.llm.base import LLMResult
    from app.llm.fake_provider import FakeProvider

    course_id = _seed_course(client, monkeypatch)

    class RefProvider(FakeProvider):
        def generate(self, system, prompt, max_tokens=64000):
            return LLMResult(
                text=json.dumps({"answer": " grounded answer ", "refs": []})
            )

    monkeypatch.setattr(main, "get_provider", lambda: RefProvider())
    response = client.post(
        "/tutor/messages",
        json={"concept_key": f"course:{course_id}", "message": "这门课讲了什么？"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["reply"]["refs"] == []
    assert body["learner"]["content"] == "这门课讲了什么？"
    # Second turn: the history is there, so the conversation can continue.
    response2 = client.post(
        "/tutor/messages",
        json={"concept_key": f"course:{course_id}", "message": "再具体一点？"},
    )
    assert response2.status_code == 200, response2.text
    history = client.get(
        "/tutor/conversation", params={"concept_key": f"course:{course_id}"}
    ).json()
    assert len(history["messages"]) == 4


def test_tutor_refs_resolve_to_lesson_ids():
    from app import tutor

    class Lesson:
        def __init__(self, id, title):
            self.id = id
            self.title = title

    lessons = [Lesson(1, "注意力机制"), Lesson(2, "多头注意力")]
    reply = tutor.parse_reply(
        json.dumps({"answer": "x", "refs": ["多头注意力", "不存在的课", "注意力机制", "多头注意力"]}),
        tutor.MODE_ANSWER,
        lessons=lessons,
    )
    assert reply.refs == [
        {"lesson_id": 2, "title": "多头注意力"},
        {"lesson_id": 1, "title": "注意力机制"},
    ]


def test_tutor_refs_absent_without_lessons():
    from app import tutor

    reply = tutor.parse_reply(json.dumps({"answer": "x"}), tutor.MODE_ANSWER)
    assert reply.refs == []
    reply2 = tutor.parse_reply(
        json.dumps({"answer": "x", "refs": "not-a-list"}), tutor.MODE_ANSWER, lessons=[]
    )
    assert reply2.refs == []


def test_regenerate_validates_before_streaming(client, monkeypatch):
    # 404 for a missing course.
    response = client.post("/api/courses/999999/regenerate/stream", json={"feedback": "x"})
    assert response.status_code == 404

    # A course whose lessons have no text cannot regenerate.
    from app import main, models
    from app.db import SessionLocal

    course_id = _seed_course(client, monkeypatch)
    with SessionLocal() as session:
        course = session.get(models.Course, course_id)
        for module in course.modules:
            for lesson in module.lessons:
                lesson.content = ""
        session.commit()
    response = client.post(
        f"/api/courses/{course_id}/regenerate/stream", json={"feedback": "太难了"}
    )
    assert response.status_code == 422


def test_regenerate_streams_per_lesson_drafts(client, monkeypatch):
    from app import main
    from app.llm.fake_provider import FakeProvider

    course_id = _seed_course(client, monkeypatch)
    monkeypatch.setattr(main, "get_provider", lambda: FakeProvider())
    kinds = []
    drafts = []
    with client.stream(
        "POST",
        f"/api/courses/{course_id}/regenerate/stream",
        json={"feedback": "多举例子"},
    ) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        for line in response.iter_lines():
            if line.startswith("event:"):
                kinds.append(line[len("event:"):].strip())
            if line.startswith("data:"):
                try:
                    data = json.loads(line[len("data:"):].strip())
                except ValueError:
                    continue
                if isinstance(data, dict) and "draft" in data:
                    drafts.append(data)
    assert kinds[0] == "lesson_start"
    assert kinds[-1] == "regen_done"
    assert drafts, "each lesson streams its draft"
    assert all("content" in d["draft"] for d in drafts)
    # Nothing is saved: the lessons are untouched until the learner adopts.
    from app import models
    from app.db import SessionLocal

    with SessionLocal() as session:
        lesson_ids = [d["lesson_id"] for d in drafts]
        assert session.query(models.Lesson).filter(models.Lesson.id.in_(lesson_ids)).count() == len(
            lesson_ids
        )


def test_lesson_regenerate_returns_an_unsaved_draft(client, monkeypatch):
    from app import main, models
    from app.db import SessionLocal
    from app.llm.base import LLMResult
    import json as _json

    course_id = _seed_course(client, monkeypatch)
    with SessionLocal() as session:
        lesson = (
            session.query(models.Lesson)
            .join(models.Module)
            .filter(models.Module.course_id == course_id)
            .first()
        )
        lesson_id = lesson.id
        original_content = lesson.content

    class DraftProvider:
        name = "fake"
        model = "stub"
        is_paid = False

        def generate(self, system, prompt, max_tokens=64000):
            assert "Regenerate this lesson" in prompt
            return LLMResult(
                text=_json.dumps(
                    {
                        "title": "New title",
                        "content": "# 新内容\n\n重新写过的课时。",
                        "concepts": ["新概念"],
                        "quiz": [],
                    }
                )
            )

    monkeypatch.setattr(main, "get_provider", lambda: DraftProvider())
    kinds: list[str] = []
    drafts: list[dict] = []
    with client.stream(
        "POST", f"/api/lessons/{lesson_id}/regenerate/stream", json={"feedback": "多举例子"}
    ) as response:
        assert response.status_code == 200, response.text
        assert "text/event-stream" in response.headers["content-type"]
        for line in response.iter_lines():
            if line.startswith("event:"):
                kinds.append(line[len("event:"):].strip())
            if line.startswith("data:"):
                try:
                    data = json.loads(line[len("data:"):].strip())
                except ValueError:
                    continue
                if isinstance(data, dict) and "draft" in data:
                    drafts.append(data)
    assert kinds[0] == "regen_started"
    assert kinds[-1] == "regen_done"
    assert len(drafts) == 1
    assert drafts[0]["lesson_id"] == lesson_id
    assert drafts[0]["draft"]["content"] == "# 新内容\n\n重新写过的课时。"
    assert drafts[0]["draft"]["concepts"] == ["新概念"]
    # The draft is NOT saved.
    with SessionLocal() as session:
        assert session.get(models.Lesson, lesson_id).content == original_content

    assert client.post("/api/lessons/999999/regenerate/stream", json={}).status_code == 404
