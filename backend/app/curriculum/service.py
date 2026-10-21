from collections import defaultdict

from sqlalchemy.orm import Session

from app import models, review
from app.attempts import LESSON_QUIZ_SOURCE
from app.concepts import normalize_concept
from app.curriculum.catalog import BY_ALIAS, BY_ID, TOPICS, reading
from app.knowledge import errors
from app.knowledge.models import KnowledgeEntry, KnowledgeRelation, ProjectKnowledge
from app.projects.models import ProjectCourse
from app.projects.service import get_project


def project_curriculum(session: Session, project_id: int) -> dict:
    get_project(session, project_id)
    courses = (
        session.query(models.Course)
        .join(ProjectCourse)
        .filter(ProjectCourse.project_id == project_id)
        .order_by(ProjectCourse.position, models.Course.id)
        .all()
    )
    points: dict[str, dict] = {}
    trees = []

    def point(key: str, label: str) -> dict:
        return points.setdefault(
            key, {"key": key, "label": label, "lesson_ids": [], "knowledge_ids": []}
        )

    for course in courses:
        modules = {}
        for lesson in review.course_lessons(session, course):
            module = lesson.module
            branch = modules.setdefault(
                module.id, {"id": module.id, "title": module.title, "lessons": []}
            )
            labels = [raw for raw in lesson.concepts or [] if isinstance(raw, str)]
            labels += [item.concept for item in lesson.quiz_items]
            keys = list(
                dict.fromkeys(normalize_concept(raw) for raw in labels if normalize_concept(raw))
            )
            for raw in labels:
                key = normalize_concept(raw)
                if key:
                    node = point(key, raw)
                    if lesson.id not in node["lesson_ids"]:
                        node["lesson_ids"].append(lesson.id)
            branch["lessons"].append(
                {
                    "id": lesson.id,
                    "title": lesson.title,
                    "completed": lesson.completed_at is not None,
                    "concept_keys": keys,
                }
            )
        trees.append({"id": course.id, "title": course.title, "modules": list(modules.values())})

    entries = (
        session.query(KnowledgeEntry)
        .join(ProjectKnowledge)
        .filter(ProjectKnowledge.project_id == project_id)
        .all()
    )
    by_entry = {entry.id: entry for entry in entries if entry.concept_key}
    for entry in by_entry.values():
        point(entry.concept_key, entry.title)["knowledge_ids"].append(entry.id)
    dependencies: dict[str, set[str]] = defaultdict(set)
    if by_entry:
        relations = (
            session.query(KnowledgeRelation)
            .filter(
                KnowledgeRelation.kind == "prerequisite",
                KnowledgeRelation.from_id.in_(by_entry),
                KnowledgeRelation.to_id.in_(by_entry),
            )
            .all()
        )
        for relation in relations:
            before, after = (
                by_entry[relation.from_id].concept_key,
                by_entry[relation.to_id].concept_key,
            )
            if before != after:
                dependencies[after].add(before)

    attempts = (
        session.query(models.Attempt)
        .join(models.Lesson, models.Attempt.lesson_id == models.Lesson.id)
        .join(models.Module)
        .join(ProjectCourse, ProjectCourse.course_id == models.Module.course_id)
        .filter(ProjectCourse.project_id == project_id)
        .order_by(models.Attempt.created_at, models.Attempt.id)
        .all()
    )
    formal = defaultdict(list)
    seen_lesson_items = set()
    for attempt in attempts:
        if attempt.source == review.REVIEW_SESSION_SOURCE:
            formal[attempt.concept_key].append(attempt)
        elif attempt.source == LESSON_QUIZ_SOURCE and attempt.quiz_item_id not in seen_lesson_items:
            seen_lesson_items.add(attempt.quiz_item_id)
            formal[attempt.concept_key].append(attempt)
    open_keys = {task["concept_key"] for task in errors.tasks(session, project_id)}
    for key, node in points.items():
        evidence = formal[key]
        recent = evidence[-3:]
        stable = (
            len(recent) == 3
            and all(item.correct for item in recent)
            and len({item.quiz_item_id for item in recent}) >= 2
        )
        node["status"] = (
            "needs_review"
            if key in open_keys or (recent and not recent[-1].correct)
            else "ready_for_advanced"
            if stable
            else "learning"
            if evidence
            else "unassessed"
        )
        node["evidence_count"] = len(evidence)
        node["distinct_items"] = len({item.quiz_item_id for item in evidence})

    for key, node in points.items():
        topic = BY_ALIAS.get(key)
        prerequisites = []
        wanted = set(dependencies[key])
        for topic_id in topic["prerequisites"] if topic else []:
            matches = [
                candidate
                for candidate in points
                if BY_ALIAS.get(candidate, {}).get("id") == topic_id
            ]
            if matches:
                wanted.add(
                    next(
                        (
                            candidate
                            for candidate in matches
                            if points[candidate]["status"] == "ready_for_advanced"
                        ),
                        matches[0],
                    )
                )
            else:
                parent = BY_ID[topic_id]
                prerequisites.append(
                    {
                        "key": topic_id,
                        "label": parent["title"],
                        "in_project": False,
                        "ready": False,
                        "reading": reading(parent),
                    }
                )
        for before in sorted(wanted):
            if before in points:
                prerequisites.append(
                    {
                        "key": before,
                        "label": points[before]["label"],
                        "in_project": True,
                        "ready": points[before]["status"] == "ready_for_advanced",
                        "reading": reading(BY_ALIAS.get(before)),
                    }
                )
        node["prerequisites"] = prerequisites
        node["reading"] = reading(topic)
        node["extension"] = node["reading"] is None
        node["recommendation"] = (
            "review"
            if node["status"] == "needs_review"
            else "prerequisite"
            if any(not parent["ready"] for parent in prerequisites)
            else "integrated"
            if node["status"] == "ready_for_advanced" and prerequisites
            else "advanced"
            if node["status"] == "ready_for_advanced"
            else "consolidation"
            if node["status"] == "learning"
            else "foundation"
        )
    return {
        "project_id": project_id,
        "courses": trees,
        "points": list(points.values()),
        "pathway": [
            {
                "id": topic["id"],
                "title": topic["title"],
                "prerequisites": topic["prerequisites"],
                "reading": reading(topic),
            }
            for topic in TOPICS
        ],
    }
