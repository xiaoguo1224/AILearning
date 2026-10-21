"""Markdown-folder import and manual content editing."""

FILES = [
    {"path": "ml-course/course.json", "content": '{"title": "ML 入门", "description": "desc"}'},
    {"path": "ml-course/01-第一章/01-注意力.md", "content": "# 注意力机制\n\n内容 A"},
    {"path": "ml-course/01-第一章/02-多头.md", "content": "# 多头注意力\n\n内容 B"},
    {"path": "ml-course/02-第二章/01-位置.md", "content": "没有标题的内容 C"},
    {"path": "ml-course/notes.txt", "content": "ignored"},
]


def test_import_builds_modules_and_lessons(client):
    response = client.post("/api/courses/import", json={"files": FILES})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["title"] == "ML 入门"
    assert body["modules"] == 2
    assert body["lessons"] == 3

    course = client.get(f"/courses/{body['id']}").json()
    assert course["title"] == "ML 入门"
    assert [m["title"] for m in course["modules"]] == ["第一章", "第二章"]
    first = course["modules"][0]["lessons"]
    assert [l["title"] for l in first] == ["注意力机制", "多头注意力"]


def test_import_falls_back_to_folder_name(client):
    files = [
        {"path": "my-notes/01-a.md", "content": "# A\n\nx"},
        {"path": "my-notes/02-b.md", "content": "# B\n\ny"},
    ]
    response = client.post("/api/courses/import", json={"files": files})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["title"] == "my-notes"
    assert body["modules"] == 1  # root-level files share one module


def test_import_refuses_unsafe_paths(client):
    response = client.post(
        "/api/courses/import",
        json={"files": [{"path": "../evil.md", "content": "x"}]},
    )
    assert response.status_code == 422
    response = client.post(
        "/api/courses/import",
        json={"files": [{"path": "/abs.md", "content": "x"}]},
    )
    assert response.status_code == 422


def test_import_refuses_without_markdown(client):
    response = client.post(
        "/api/courses/import", json={"files": [{"path": "a/b.txt", "content": "x"}]}
    )
    assert response.status_code == 422


def test_patch_lesson_content(client):
    course_id = client.post("/api/courses/import", json={"files": FILES}).json()["id"]
    lesson_id = client.get(f"/courses/{course_id}").json()["modules"][0]["lessons"][0][
        "id"
    ]
    response = client.patch(
        f"/api/lessons/{lesson_id}",
        json={"content": "# 新标题\n\n新内容", "title": "注意力机制（修订版）"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "注意力机制（修订版）"


def test_patch_lesson_requires_a_field(client):
    course_id = client.post("/api/courses/import", json={"files": FILES}).json()["id"]
    lesson_id = client.get(f"/courses/{course_id}").json()["modules"][0]["lessons"][0][
        "id"
    ]
    assert client.patch(f"/api/lessons/{lesson_id}", json={}).status_code == 422
    assert client.patch("/api/lessons/999999", json={"title": "x"}).status_code == 404


def test_patch_course(client):
    course_id = client.post("/api/courses/import", json={"files": FILES}).json()["id"]
    response = client.patch(
        f"/api/courses/{course_id}", json={"title": "新课名", "description": "新简介"}
    )
    assert response.status_code == 200
    course = client.get(f"/courses/{course_id}").json()
    assert course["title"] == "新课名"
    assert course["description"] == "新简介"
    assert client.patch("/api/courses/999999", json={"title": "x"}).status_code == 404
