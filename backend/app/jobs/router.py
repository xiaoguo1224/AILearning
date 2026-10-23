"""Job status API: create is done by the feature endpoints; here the frontend
polls for progress and fetches results."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.attempts import iso_utc
from app.db import get_session
from app.jobs.models import Job
from app.submissions.models import Submission

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

Db = Depends(get_session)


class JobOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    type: str
    status: str
    progress: dict | None = None
    result: dict | None = None
    trace: dict | None = None
    error: str | None = None
    ref_type: str | None = None
    ref_id: int | None = None
    # Where the learner goes to see what this job produced. Computed here because
    # resolving it needs the database: a quiz job knows only its item id, and the
    # course is two joins away.
    href: str | None = None
    created_at: str
    updated_at: str


class JobList(BaseModel):
    items: list[JobOut]
    total: int


def _course_of_lesson(session: Session, lesson_id: int) -> int | None:
    lesson = session.get(models.Lesson, lesson_id)
    if lesson is None:
        return None
    module = session.get(models.Module, lesson.module_id)
    return module.course_id if module else None


def _link_for(job: Job, session: Session) -> str | None:
    """The page that shows this job's subject, or None when there is nothing to open.

    Every job that CAN be opened should be: the list used to offer "打开" only for
    course generation, so a finished quiz job or code review left the learner with a
    row of JSON and no way to reach the thing it was about.
    """
    if job.type == "course_generate_staged":
        if job.status != "completed":
            return f"/courses/new?job={job.id}"
        course_id = (job.result or {}).get("course_id")
        return f"/courses/{course_id}" if course_id is not None else None
    if job.type == "course_generate":
        course_id = (job.result or {}).get("course_id")
        return f"/courses/{course_id}" if course_id is not None else None
    if job.ref_id is None:
        return None
    if job.ref_type == "course":
        if job.type in ("quiz_generate", "quiz_variant"):
            return f"/courses/{job.ref_id}/quiz"
        if job.type == "concept_extract":
            return f"/courses/{job.ref_id}/concepts"
        return f"/courses/{job.ref_id}"
    if job.ref_type == "lesson":
        course_id = _course_of_lesson(session, job.ref_id)
        return f"/courses/{course_id}/lessons/{job.ref_id}" if course_id else None
    if job.ref_type == "quiz":
        item = session.get(models.QuizItem, job.ref_id)
        if item is None:
            return None
        course_id = _course_of_lesson(session, item.lesson_id)
        if course_id is None:
            return None
        # Only code questions have their own page; the others live in the bank.
        if item.kind == "code":
            return f"/courses/{course_id}/quiz/{item.id}"
        return f"/courses/{course_id}/quiz"
    if job.ref_type == "submission":
        submission = session.get(Submission, job.ref_id)
        if submission is None:
            return None
        if submission.project_id is not None:
            return f"/projects/{submission.project_id}/submissions/{job.ref_id}"
        # A question-scoped submission belongs to no project; it opens on its question.
        if submission.quiz_item_id is not None:
            item = session.get(models.QuizItem, submission.quiz_item_id)
            course_id = _course_of_lesson(session, item.lesson_id) if item else None
            if course_id:
                return f"/courses/{course_id}/quiz/{item.id}"
        return None
    if job.ref_type == "project":
        if job.type == "project_graph_extract":
            return f"/projects/{job.ref_id}/knowledge"
        return f"/projects/{job.ref_id}"
    return None


def _out(job: Job, session: Session) -> JobOut:
    return JobOut(
        id=job.id,
        type=job.type,
        status=job.status,
        progress=job.progress,
        result=job.result,
        trace=job.trace,
        error=job.error,
        ref_type=job.ref_type,
        ref_id=job.ref_id,
        href=_link_for(job, session),
        # iso_utc, not .isoformat(). Every stored timestamp is naive UTC (SQLite drops
        # tzinfo), so a bare .isoformat() emits "2026-10-23T07:04:36" with no offset.
        # A browser reads an offset-less string as LOCAL time, so a Beijing learner saw
        # every job timestamp eight hours early. iso_utc stamps the +00:00 that was
        # always implied, and the browser converts it to the wall clock they live in.
        created_at=iso_utc(job.created_at) or "",
        updated_at=iso_utc(job.updated_at) or "",
    )


@router.get("", response_model=JobList)
def list_jobs(
    session: Session = Db,
    status: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """Recent jobs, newest first. Filter by status (e.g. running)."""
    query = session.query(Job).order_by(Job.created_at.desc())
    if status:
        query = query.filter(Job.status == status)
    total = query.count()
    jobs = query.offset(offset).limit(limit).all()
    return JobList(items=[_out(j, session) for j in jobs], total=total)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, session: Session = Db):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return _out(job, session)


@router.post("/{job_id}/cancel", response_model=JobOut)
def cancel_job(job_id: str, session: Session = Db):
    """Mark a pending/running job cancelled. Best-effort: a thread already
    deep in a model call finishes, but its result is discarded."""
    session.query(Job).filter_by(id=job_id).update({Job.id: Job.id})
    job = session.get(Job, job_id, populate_existing=True)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status in ("pending", "running", "awaiting_review"):
        job.status = "cancelled"
        session.commit()
        session.refresh(job)
    return _out(job, session)
