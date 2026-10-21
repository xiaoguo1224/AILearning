from app import models
from app.db import SessionLocal


def course(client, project, labels):
    with SessionLocal() as session:
        row = models.Course(title="PyTorch", description="")
        module = models.Module(title="Foundations", position=0)
        row.modules.append(module)
        lesson = models.Lesson(title="Tensors", position=0, concepts=labels, content="")
        module.lessons.append(lesson)
        lesson.quiz_items = [
            models.QuizItem(
                question=f"Q{i}", answer="yes", concept=labels[0], kind="short", options=[]
            )
            for i in range(3)
        ]
        session.add(row)
        session.commit()
        course_id, lesson_id, item_ids = row.id, lesson.id, [item.id for item in lesson.quiz_items]
    assert (
        client.put(f"/api/projects/{project}/courses/{course_id}", json={"position": 0}).status_code
        == 200
    )
    return course_id, lesson_id, item_ids


def project(client, name="Learning"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def tree(client, project_id):
    response = client.get(f"/api/projects/{project_id}/curriculum")
    assert response.status_code == 200, response.text
    return response.json()


def answer(lesson, item, key, correct=True, source="lesson_quiz", number=1):
    with SessionLocal() as session:
        session.add(
            models.Attempt(
                lesson_id=lesson,
                quiz_item_id=item,
                concept_key=key,
                concept_label=key,
                submitted_answer="yes" if correct else "no",
                expected_answer="yes",
                correct=correct,
                source=source,
                attempt_no=number,
            )
        )
        session.commit()


def test_tree_preserves_course_ids_and_keeps_alias_histories_separate(client):
    pid = project(client)
    cid, lid, _ = course(client, pid, ["Tensors", "张量", "Broadcasting"])
    result = tree(client, pid)
    assert result["courses"][0]["id"] == cid
    assert result["courses"][0]["modules"][0]["lessons"][0]["id"] == lid
    nodes = {node["key"]: node for node in result["points"]}
    assert nodes["tensors"]["reading"] == nodes["张量"]["reading"]
    assert nodes["tensors"]["status"] == nodes["张量"]["status"] == "unassessed"
    assert nodes["broadcasting"]["recommendation"] == "prerequisite"
    assert {p["key"] for p in nodes["broadcasting"]["prerequisites"]} == {"tensors"}


def test_multiple_distinct_first_answers_unlock_advancement_without_writing_history(client):
    pid = project(client)
    _, lid, items = course(client, pid, ["Tensors"])
    for item in items:
        answer(lid, item, "tensors")
    with SessionLocal() as session:
        before = session.query(models.Attempt).count(), session.query(models.ReviewCard).count()
    node = tree(client, pid)["points"][0]
    assert node["status"] == "ready_for_advanced"
    assert node["recommendation"] == "advanced"
    assert node["evidence_count"] == 3
    assert node["distinct_items"] == 3
    with SessionLocal() as session:
        assert before == (
            session.query(models.Attempt).count(),
            session.query(models.ReviewCard).count(),
        )
    client.post(f"/api/projects/{pid}/errors", json={"concept_key": "tensors"})
    assert tree(client, pid)["points"][0]["recommendation"] == "review"


def test_retries_and_remedial_practice_do_not_become_formal_mastery(client):
    pid = project(client)
    _, lid, items = course(client, pid, ["Tensors"])
    answer(lid, items[0], "tensors", correct=False)
    answer(lid, items[0], "tensors", number=2)
    answer(lid, items[1], "tensors", source="remedial_practice")
    answer(lid, items[2], "tensors", source="remedial_practice")
    node = tree(client, pid)["points"][0]
    assert node["status"] == "needs_review"
    assert node["evidence_count"] == node["distinct_items"] == 1


def test_foreign_course_evidence_and_calendar_decay_do_not_change_the_tree(client):
    pid, other = project(client), project(client, "Other")
    course(client, pid, ["Tensors"])
    _, lid, items = course(client, other, ["Tensors"])
    for item in items:
        answer(lid, item, "tensors")
    assert tree(client, pid)["points"][0]["status"] == "unassessed"
    # A card's time/stability state is irrelevant to this evidence-only projection.
    with SessionLocal() as session:
        session.add(
            models.ReviewCard(
                concept_key="tensors", concept_label="Tensors", stability=999, state="review"
            )
        )
        session.commit()
    assert tree(client, pid)["points"][0]["status"] == "unassessed"


def test_unmapped_topics_have_no_invented_citation(client):
    pid = project(client)
    course(client, pid, ["SPDM"])
    node = tree(client, pid)["points"][0]
    assert node["reading"] is None
    assert node["extension"] is True
    assert node["prerequisites"] == []
    assert client.get("/api/projects/999999/curriculum").status_code == 404


def test_only_explicit_project_relations_become_prerequisites(client):
    pid, other = project(client), project(client, "Other")
    def entry(owner, key):
        return client.post(f"/api/projects/{owner}/knowledge", json={"title": key, "body": "Note", "concept_key": key}).json()["id"]
    first, second, foreign = entry(pid, "basics"), entry(pid, "advanced"), entry(other, "foreign")
    client.post(f"/api/knowledge/{first}/relations", json={"to_id": second, "kind": "prerequisite"})
    client.post(f"/api/knowledge/{foreign}/relations", json={"to_id": second, "kind": "prerequisite"})
    nodes = {node["key"]: node for node in tree(client, pid)["points"]}
    assert nodes["advanced"]["prerequisites"] == [{"key": "basics", "label": "basics", "in_project": True, "ready": False, "reading": None}]
    assert nodes["basics"]["prerequisites"] == []
