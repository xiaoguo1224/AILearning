"""Diagnoses and the review queue they produce.

Deliberately a router of its own rather than more endpoints on the knowledge router: this
half of the feature is about what the learner keeps getting wrong, and the only thing it
shares with the knowledge entries is the concept key. Keeping them apart is also what
makes the firewall visible — there is no endpoint here that touches a review card, and a
reader can see that by scrolling one file.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.knowledge import errors as service
from app.knowledge.models import ErrorCause
from app.knowledge.schemas import (
    ErrorCauseInput,
    ErrorCauseList,
    ErrorCauseOut,
    ErrorFromAttemptInput,
    ErrorFromReviewInput,
    ReviewTaskList,
    ReviewTaskOut,
)
from app.projects.service import get_project, local_mutation, project_session

logger = logging.getLogger("studyforge.knowledge.errors")

router = APIRouter(prefix="/api", tags=["errors"])
Db = Annotated[Session, Depends(project_session)]
MUTATION = [Depends(local_mutation)]

MAX_SQLITE_INTEGER = 2**63 - 1
EntityId = Annotated[int, Path(gt=0, le=MAX_SQLITE_INTEGER)]


@router.post(
    "/projects/{project_id}/errors",
    response_model=ErrorCauseOut,
    status_code=201,
    dependencies=MUTATION,
)
def record_error(project_id: EntityId, body: ErrorCauseInput, session: Db):
    """File one diagnosis against a concept, and map it to this project's knowledge."""
    row = service.record(
        session,
        project_id,
        concept_key=body.concept_key,
        concept_label=body.concept_label,
        knowledge_id=body.knowledge_id,
        cause=body.cause,
        note=body.note,
        source_kind=body.source_kind,
        source_id=body.source_id,
        detail=body.detail,
    )
    return ErrorCauseOut.model_validate(row)


@router.post(
    "/projects/{project_id}/errors/from-attempt",
    response_model=ErrorCauseOut,
    status_code=201,
    dependencies=MUTATION,
)
def record_error_from_attempt(project_id: EntityId, body: ErrorFromAttemptInput, session: Db):
    """Diagnose a wrong quiz answer.

    A separate endpoint rather than a flag on the one above, because the concept is not
    the caller's to choose here: it comes from the attempt. Accepting a concept alongside
    an attempt id would allow a diagnosis that points somewhere the answer was not about.
    """
    row = service.from_attempt(
        session, project_id, attempt_id=body.attempt_id, cause=body.cause, note=body.note
    )
    return ErrorCauseOut.model_validate(row)


@router.get("/projects/{project_id}/errors", response_model=ErrorCauseList)
def list_errors(
    project_id: EntityId,
    session: Db,
    open_only: bool = Query(default=True, alias="open"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=MAX_SQLITE_INTEGER),
):
    get_project(session, project_id)
    query = session.query(ErrorCause).filter(ErrorCause.project_id == project_id)
    if open_only:
        query = query.filter(ErrorCause.dismissed_at.is_(None))
    total = query.count()
    rows = (
        query.order_by(ErrorCause.created_at.desc(), ErrorCause.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return ErrorCauseList(
        items=[ErrorCauseOut.model_validate(row) for row in rows],
        total=total,
        cause_counts=service.cause_counts(session, project_id),
    )


@router.post("/projects/{project_id}/errors/from-review", response_model=ErrorCauseOut,
             status_code=201, dependencies=MUTATION)
def record_error_from_review(project_id: EntityId, body: ErrorFromReviewInput, session: Db):
    return service.from_review(session, project_id, **body.model_dump())


@router.get("/projects/{project_id}/review-tasks/practice")
def review_task_practice(project_id: EntityId, session: Db,
                         concept: str = Query(min_length=1, max_length=200)):
    get_project(session, project_id)
    return service.practice_queue(session, project_id, concept)


@router.post(
    "/errors/{error_id}/dismiss", response_model=ErrorCauseOut, dependencies=MUTATION
)
def dismiss_error(error_id: EntityId, session: Db):
    """Say this diagnosis is not worth acting on. It stays in the counts.

    There is deliberately no "mark as practised" counterpart. Closure by practice is
    derived from the review log, so a button that claimed it would be a second, weaker
    account of the same fact — and the one a person could press without practising.
    """
    row = service.dismiss(session, error_id)
    return ErrorCauseOut.model_validate(row)


@router.get("/projects/{project_id}/review-tasks", response_model=ReviewTaskList)
def list_review_tasks(project_id: EntityId, session: Db):
    """Concepts with open diagnoses, newest first.

    Not a schedule: the ordering is by the newest diagnosis, and the card state travels
    along only so the screen can say "this one is also due". Nothing here is written back
    to the scheduler, and reading it twice changes nothing.
    """
    get_project(session, project_id)
    items = service.tasks(session, project_id)
    return ReviewTaskList(
        items=[ReviewTaskOut(**item) for item in items],
        total=len(items),
    )
