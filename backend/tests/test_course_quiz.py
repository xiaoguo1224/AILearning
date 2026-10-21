"""Course question bank aggregation and AI question generation."""

import json


def _seed_course(client, monkeypatch):
    """One course, one module, two lessons, three quiz items via the sync generate route."""
    from app import main
    from app.llm.fake_provider import FakeProvider

    monkeypatch.setattr(main, "get_provider", lambda: FakeProvider())
    response = client.post(
        "/courses/generate",
        json={"text": "transformer attention is all you need " * 60},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_quiz_bank_aggregates_without_answers(client, monkeypatch):
    course_id = _seed_course(client, monkeypatch)
    response = client.get(f"/api/courses/{course_id}/quiz")
    assert response.status_code == 200
    bank = response.json()
    assert bank["course_id"] == course_id
    assert bank["total"] > 0
    assert len(bank["modules"]) == 2  # fake provider's outline
    for module in bank["modules"]:
        for lesson in module["lessons"]:
            for item in lesson["items"]:
                assert set(item) == {"id", "question", "kind", "options", "concept", "attempt_state"}
                assert "answer" not in item, "answers must not leak through the bank"
    counted = sum(
        len(lesson["items"]) for module in bank["modules"] for lesson in module["lessons"]
    )
    assert bank["total"] == counted


def test_quiz_bank_404_for_missing_course(client):
    assert client.get("/api/courses/999999/quiz").status_code == 404


def test_generate_questions_mixed_kinds(client, monkeypatch):
    from app import main
    from app.course_quiz import router as quiz_router
    from app.llm.fake_provider import FakeProvider

    course_id = _seed_course(client, monkeypatch)
    reply = [
        {
            "question": "Attention 的 Q 来自哪里？",
            "kind": "mcq",
            "options": ["输入 X", "输出 Y", "位置编码", "偏置项"],
            "answer": "输入 X",
            "concept": "注意力",
        },
        {
            "question": "自注意力计算中 QK^T 后除以根号 dk 的目的是什么？",
            "kind": "short",
            "options": [],
            "answer": "缩放点积，防止 softmax 饱和",
            "concept": "注意力",
        },
        {
            "question": "Transformer 只用注意力机制，不用循环和卷积。",
            "kind": "truefalse",
            "options": [],
            "answer": "正确",
            "concept": "注意力",
        },
        {
            "question": "实现 scaled_dot_product_attention(q, k, v)",
            "kind": "code",
            "options": [],
            "answer": "def scaled_dot_product_attention(q, k, v):\n    return v",
            "concept": "注意力",
        },
    ]

    from app.llm.base import LLMResult

    class QuizProvider(FakeProvider):
        def generate(self, system, prompt, max_tokens=64000):
            if "出题老师" in system or "出题老师" in prompt:
                return LLMResult(text=json.dumps(reply))
            return super().generate(system, prompt, max_tokens)

    monkeypatch.setattr(quiz_router, "get_provider", lambda: QuizProvider())
    response = client.post(
        f"/api/courses/{course_id}/quiz/generate",
        json={
            "items": [
                {"kind": "mcq", "count": 1},
                {"kind": "short", "count": 1},
                {"kind": "truefalse", "count": 1},
                {"kind": "code", "count": 1},
            ]
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["course_id"] == course_id
    assert body["lesson_id"] is None
    kinds = [item["kind"] for item in body["created"]]
    assert kinds == ["mcq", "short", "truefalse", "code"]
    # truefalse options are normalized server-side.
    tf = next(item for item in body["created"] if item["kind"] == "truefalse")
    assert tf["options"] == ["正确", "错误"]
    # The new items show up in the bank.
    bank = client.get(f"/api/courses/{course_id}/quiz").json()
    assert bank["total"] >= 4


def test_generate_questions_scoped_to_lesson(client, monkeypatch):
    from app import main
    from app.course_quiz import router as quiz_router
    from app.llm.fake_provider import FakeProvider

    course_id = _seed_course(client, monkeypatch)
    bank = client.get(f"/api/courses/{course_id}/quiz").json()
    lesson_id = bank["modules"][0]["lessons"][1]["id"]

    from app.llm.base import LLMResult

    class QuizProvider(FakeProvider):
        def generate(self, system, prompt, max_tokens=64000):
            if "出题老师" in system or "出题老师" in prompt:
                return LLMResult(
                    text=json.dumps(
                        [
                            {
                                "question": "Q?",
                                "kind": "mcq",
                                "options": ["A", "B", "C", "D"],
                                "answer": "A",
                                "concept": "c",
                            }
                        ]
                    )
                )
            return super().generate(system, prompt, max_tokens)

    monkeypatch.setattr(quiz_router, "get_provider", lambda: QuizProvider())
    response = client.post(
        f"/api/courses/{course_id}/quiz/generate",
        json={"lesson_id": lesson_id, "items": [{"kind": "mcq", "count": 1}]},
    )
    assert response.status_code == 201, response.text
    assert response.json()["lesson_id"] == lesson_id


def test_generate_questions_refuses_unknown_kind(client, monkeypatch):
    course_id = _seed_course(client, monkeypatch)
    response = client.post(
        f"/api/courses/{course_id}/quiz/generate",
        json={"items": [{"kind": "essay", "count": 2}]},
    )
    assert response.status_code == 422


def test_generate_questions_refuses_empty_and_over_cap(client, monkeypatch):
    course_id = _seed_course(client, monkeypatch)
    empty = client.post(
        f"/api/courses/{course_id}/quiz/generate",
        json={"items": [{"kind": "mcq", "count": 0}]},
    )
    assert empty.status_code == 422
    over = client.post(
        f"/api/courses/{course_id}/quiz/generate",
        json={"items": [{"kind": "mcq", "count": 21}]},
    )
    assert over.status_code == 422


def test_generate_questions_lesson_must_belong_to_course(client, monkeypatch):
    first = _seed_course(client, monkeypatch)
    second = _seed_course(client, monkeypatch)
    other_lesson = client.get(f"/api/courses/{second}/quiz").json()["modules"][0][
        "lessons"
    ][0]["id"]
    response = client.post(
        f"/api/courses/{first}/quiz/generate",
        json={"lesson_id": other_lesson, "items": [{"kind": "mcq", "count": 1}]},
    )
    assert response.status_code == 422
