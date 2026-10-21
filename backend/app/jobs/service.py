"""In-process background job runner.

Single-user local app: a thread pool is enough, no Redis/Celery. Each job runs
in its own thread with its own DB session. The HTTP request that created the
job returns immediately with the job id; the frontend polls for status.

Jobs survive page navigation because they are NOT tied to the request. They do
NOT survive a server restart — a restart marks running jobs as failed with a
clear message, and the learner can retry.
"""

import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.jobs.models import Job
from app.models import utcnow

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="job")
_lock = threading.Lock()


def create_job(
    session: Session,
    job_type: str,
    ref_type: str | None = None,
    ref_id: int | None = None,
) -> Job:
    job = Job(
        id=uuid.uuid4().hex,
        type=job_type,
        status="pending",
        ref_type=ref_type,
        ref_id=ref_id,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


def _set_status(job_id: str, status: str, **fields) -> None:
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if not job:
            return
        job.status = status
        for key, value in fields.items():
            setattr(job, key, value)
        job.updated_at = utcnow()
        session.commit()


def update_progress(job_id: str, progress: dict) -> None:
    _set_status(job_id, "running", progress=progress)


def complete_job(job_id: str, result: dict) -> None:
    _set_status(job_id, "completed", result=result, progress=None)
    logger.info("job_completed id=%s", job_id)


def fail_job(job_id: str, error: str) -> None:
    _set_status(job_id, "failed", error=error[:500])
    logger.warning("job_failed id=%s error=%s", job_id, error[:200])


def run_in_background(job_id: str, fn) -> None:
    """Run `fn(job_id)` in the pool. `fn` must use its own DB sessions."""

    def _wrapper():
        _set_status(job_id, "running")
        try:
            fn(job_id)
        except Exception as exc:  # noqa: BLE001 — a job must never kill the pool
            logger.exception("job_crashed id=%s", job_id)
            fail_job(job_id, str(exc))

    _executor.submit(_wrapper)


def mark_interrupted_jobs() -> int:
    """On boot, fail jobs left running by a previous process. Returns the count.

    The jobs table may not exist yet during old-database migrations; in that
    case there is nothing to mark and we return 0.
    """
    from sqlalchemy.exc import OperationalError

    try:
        with SessionLocal() as session:
            jobs = (
                session.query(Job)
                .filter(Job.status.in_(["pending", "running"]))
                .all()
            )
            for job in jobs:
                job.status = "failed"
                job.error = "Server restarted while this job was running. Please retry."
                job.updated_at = utcnow()
            session.commit()
            return len(jobs)
    except OperationalError:
        return 0
