"""Concept extraction API: trigger AI extraction as background job."""

from fastapi import APIRouter, Depends, HTTPException

from app.concept_extract import service as extract_service
from app.db import get_session as get_db
from app.jobs import service as jobs
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/courses/{course_id}/concepts", tags=["concepts"])


def _run_extraction(job_id: str, course_id: int):
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        jobs.update_progress(job_id, {"stage": "extracting"})
        result = extract_service.extract_course_concepts(db, course_id)
        total = sum(len(v) for v in result.values())
        jobs.complete_job(job_id, {"course_id": course_id, "lessons": len(result), "concepts": total})
    except Exception as exc:  # noqa: BLE001
        jobs.fail_job(job_id, str(exc)[:500])
    finally:
        db.close()


@router.post("/extract/job", status_code=202)
def extract_concepts_job(course_id: int, db: Session = Depends(get_db)):
    from app import models as m

    if not db.get(m.Course, course_id):
        raise HTTPException(404, "Course not found")
    # Prevent duplicate: return existing running job if any.
    existing = (
        db.query(jobs.Job)
        .filter(
            jobs.Job.type == "concept_extract",
            jobs.Job.ref_id == course_id,
            jobs.Job.status.in_(["pending", "running"]),
        )
        .order_by(jobs.Job.created_at.desc())
        .first()
    )
    if existing:
        return {"job_id": existing.id, "resumed": True}
    job = jobs.create_job(
        db,
        job_type="concept_extract",
        ref_type="course",
        ref_id=course_id,
    )
    def _run(jid: str):
        _run_extraction(jid, course_id)
    jobs.run_in_background(job.id, _run)
    return {"job_id": job.id}
