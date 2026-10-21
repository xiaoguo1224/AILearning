"""Job status API: create is done by the feature endpoints; here the frontend
polls for progress and fetches results."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session
from app.jobs.models import Job
from app.jobs.service import create_job, run_in_background

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
        error=job.error,
        ref_type=job.ref_type,
        ref_id=job.ref_id,
        created_at=job.created_at.isoformat() if job.created_at else "",
        updated_at=job.updated_at.isoformat() if job.updated_at else "",
    )


@router.get("", response_model=JobList)
def list_jobs(
    session: Session = Db,
    status: str | None = Query(default=None),
    limit: int = Query(default=20, le=100),
):
    """Recent jobs, newest first. Filter by status (e.g. running)."""
    query = session.query(Job).order_by(Job.created_at.desc())
    if status:
        query = query.filter(Job.status == status)
    jobs = query.limit(limit).all()
    return JobList(items=[_out(j) for j in jobs], total=len(jobs))


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
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status in ("pending", "running"):
        job.status = "cancelled"
        session.commit()
        session.refresh(job)
    return _out(job)
