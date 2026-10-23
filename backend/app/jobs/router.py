"""Job status API: create is done by the feature endpoints; here the frontend
polls for progress and fetches results."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.attempts import iso_utc
from app.db import get_session
from app.jobs.models import Job

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
    created_at: str
    updated_at: str


class JobList(BaseModel):
    items: list[JobOut]
    total: int


def _out(job: Job) -> JobOut:
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
    return JobList(items=[_out(j) for j in jobs], total=total)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, session: Session = Db):
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return _out(job)


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
    return _out(job)
