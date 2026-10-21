import hashlib
import json
import logging
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.content_reviews.models import ContentReview
from app.content_reviews.schemas import ContentReviewInput, ContentReviewOut
from app.knowledge import service as knowledge
from app.knowledge.models import KnowledgeEntry
from app.models import Lesson, Module
from app.projects.models import ProjectCourse
from app.projects.service import project_error, writable_project
from app.submissions.models import CodeReview, Submission

logger = logging.getLogger("studyforge.content_reviews")


@dataclass(frozen=True)
class Source:
    title: str
    body: str
    knowledge_kind: str

    @property
    def digest(self) -> str:
        return hashlib.sha256(
            json.dumps([self.title, self.body], ensure_ascii=False).encode()
        ).hexdigest()


def source(session: Session, project_id: int, kind: str, entity_id: int) -> Source:
    if kind == "lesson":
        row = (
            session.query(Lesson)
            .join(Module)
            .join(ProjectCourse, ProjectCourse.course_id == Module.course_id)
            .filter(Lesson.id == entity_id, ProjectCourse.project_id == project_id)
            .one_or_none()
        )
        if row is None:
            raise project_error(404, "lesson_not_in_project", "Lesson not found in this project.")
        return Source(row.title, row.content.strip(), "definition")
    review = (
        session.query(CodeReview)
        .join(Submission)
        .filter(CodeReview.id == entity_id, Submission.project_id == project_id)
        .one_or_none()
    )
    if review is None:
        raise project_error(404, "review_not_found", "Review not found in this project.")
    if review.solution_revealed_at is None:
        raise project_error(
            409,
            "solution_not_revealed",
            "Open the reference solution before requesting its review.",
        )
    if not review.reference_solution:
        raise project_error(422, "solution_unavailable", "No reference solution is available.")
    return Source(
        f"Reference solution · review #{review.id}",
        review.reference_solution.strip(),
        "standard_answer",
    )


def describe(session: Session, row: ContentReview) -> ContentReviewOut:
    entry = session.get(KnowledgeEntry, row.knowledge_id)
    try:
        current = source(session, row.project_id, row.source_kind, row.source_id)
    except HTTPException as exc:
        if exc.status_code not in (404, 409, 422):
            raise
        current = None
    unchanged = current is not None and current.digest == row.source_hash
    matches = (
        current is not None and entry.body == current.body and entry.kind == current.knowledge_kind
    )
    return ContentReviewOut(
        id=row.id,
        project_id=row.project_id,
        source_kind=row.source_kind,
        source_id=row.source_id,
        source_hash=row.source_hash,
        knowledge_id=row.knowledge_id,
        knowledge_status=entry.status,
        source_unchanged=unchanged,
        matches_source=matches,
        approved=unchanged and matches and entry.status == "confirmed",
    )


def create(session: Session, project_id: int, body: ContentReviewInput) -> ContentReviewOut:
    writable_project(session, project_id)
    original = source(session, project_id, body.source_kind, body.source_id)
    existing = (
        session.query(ContentReview)
        .filter_by(
            project_id=project_id,
            source_kind=body.source_kind,
            source_id=body.source_id,
            source_hash=original.digest,
        )
        .one_or_none()
    )
    if existing:
        session.commit()
        return describe(session, existing)
    entry = knowledge.create_entry(
        session,
        project_id=project_id,
        title=original.title[:200],
        body=original.body,
        kind=original.knowledge_kind,
        source_kind="manual",
        commit=False,
        provenance=[
            {
                "kind": "manual",
                "source_hash": original.digest,
                "lesson_id" if body.source_kind == "lesson" else "review_id": body.source_id,
            }
        ],
    )
    row = ContentReview(
        project_id=project_id,
        source_kind=body.source_kind,
        source_id=body.source_id,
        source_hash=original.digest,
        knowledge_id=entry.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    logger.info(
        "content_review_created project_id=%s review_id=%s knowledge_id=%s",
        project_id,
        row.id,
        entry.id,
    )
    return describe(session, row)
