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
from copy import deepcopy

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
    progress: dict | None = None,
) -> Job:
    """Queue a job. `progress` is for identity, not decoration: a route that can be
    asked for the same subject twice (one analysis per attempt) puts the narrower key
    there so a second request can recognise the first."""
    job = Job(
        id=uuid.uuid4().hex,
        type=job_type,
        status="pending",
        ref_type=ref_type,
        ref_id=ref_id,
        progress=progress,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


def find_live_job(
    session: Session,
    job_type: str,
    ref_type: str | None = None,
    ref_id: int | None = None,
) -> Job | None:
    """The job already running for this exact subject, if there is one.

    Every job here is a paid model call. A double-click, a second tab, or a page that
    re-sends its request must JOIN the work in flight rather than buy a second copy of
    it. Callers answer with `{"job_id": live.id, "resumed": True}` so the client polls
    the same job it would have started.

    Matching is on (type, ref_type, ref_id): the subject, not the request body. Two
    different attempts at the same question therefore share one guard — which is right
    for grading, where the answer is already in flight, and is why the answer-analysis
    route additionally caches per attempt (see `attempts.analysis`).
    """
    query = session.query(Job).filter(
        Job.type == job_type,
        Job.status.in_(("pending", "running")),
    )
    if ref_type is None:
        query = query.filter(Job.ref_type.is_(None))
    else:
        query = query.filter(Job.ref_type == ref_type)
    if ref_id is None:
        query = query.filter(Job.ref_id.is_(None))
    else:
        query = query.filter(Job.ref_id == ref_id)
    return query.order_by(Job.created_at.desc()).first()


def _set_status(job_id: str, status: str, **fields) -> bool:
    with SessionLocal() as session:
        # Serialize with cancellation and review decisions before reading state.
        session.query(Job).filter_by(id=job_id).update({Job.id: Job.id})
        job = session.get(Job, job_id)
        if not job or job.status in ("completed", "failed", "cancelled"):
            return False
        job.status = status
        for key, value in fields.items():
            setattr(job, key, value)
        job.updated_at = utcnow()
        session.commit()
        return True


def update_progress(job_id: str, progress: dict) -> None:
    _set_status(job_id, "running", progress=progress)


def append_trace(job_id: str, entry: dict) -> None:
    """Append a trace entry (thinking step or tool call) to the job's trace log."""
    from app.db import SessionLocal as _SessionLocal

    with _SessionLocal() as session:
        session.query(Job).filter_by(id=job_id).update({Job.id: Job.id})
        job = session.get(Job, job_id)
        if not job:
            return
        trace = deepcopy(job.trace) if job.trace else {"entries": []}
        if "entries" not in trace:
            trace = {"entries": []}
        entry = dict(entry)
        entry["at"] = utcnow().isoformat()
        trace["entries"].append(entry)
        job.trace = trace
        job.updated_at = utcnow()
        session.commit()


def complete_job(job_id: str, result: dict) -> None:
    _set_status(job_id, "completed", result=result, progress=None)
    logger.info("job_completed id=%s", job_id)


def fail_job(job_id: str, error: str) -> None:
    _set_status(job_id, "failed", error=error[:500])
    logger.warning("job_failed id=%s error=%s", job_id, error[:200])


def run_in_background(job_id: str, fn) -> None:
    """Run `fn(job_id)` in the pool. `fn` must use its own DB sessions."""

    def _wrapper():
        if not _set_status(job_id, "running"):
            return
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
            jobs = session.query(Job).filter(Job.status.in_(["pending", "running"])).all()
            for job in jobs:
                job.status = "failed"
                job.error = "Server restarted while this job was running. Please retry."
                job.updated_at = utcnow()
            session.commit()
            return len(jobs)
    except OperationalError:
        return 0
