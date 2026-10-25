from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.answer_history import service
from app.answer_history.models import AnswerSnapshot, AnswerSnapshotEvent
from app.attempts import iso_utc
from app.db import get_session

router = APIRouter(prefix="/api", tags=["answer-history"])
Db = Annotated[Session, Depends(get_session)]


@router.get("/answer-history")
def list_history(session: Db, question_id: int | None = Query(None, gt=0),
                 course_id: int | None = Query(None, gt=0),
                 variant_id: int | None = Query(None, gt=0),
                 limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0, le=2_147_483_647)):
    query = session.query(AnswerSnapshot)
    from app import models

    current_item = session.get(models.QuizItem, question_id) if question_id else None
    current_course = session.get(models.Course, course_id) if course_id else current_item.lesson.module.course if current_item else None
    if current_course:
        query = query.filter(AnswerSnapshot.snapshot["course_created_at"].as_string() == iso_utc(current_course.created_at))
    if question_id is not None:
        query = query.filter(AnswerSnapshot.question_id == question_id)
    if course_id is not None:
        query = query.filter(AnswerSnapshot.course_id == course_id)
    if variant_id is not None:
        query = query.filter(AnswerSnapshot.snapshot["variant_id"].as_integer() == variant_id)
    total = query.count()
    rows = query.order_by(AnswerSnapshot.source_created_at.desc(), AnswerSnapshot.id.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [{
        "id": r.id, "question_id": r.question_id, "source": r.source,
        "created_at": iso_utc(r.source_created_at), "question": r.snapshot.get("question"),
        "correct": r.snapshot.get("correct"), "complete": r.snapshot["complete"],
    } for r in rows]}


@router.get("/answer-history/{record_id}")
def read_history(record_id: int, session: Db, reveal: bool = False):
    row = session.get(AnswerSnapshot, record_id)
    if row is None:
        raise HTTPException(404, "Answer snapshot not found")

    def visible(data):
        return {k: v for k, v in data.items() if reveal or k not in {
            "expected", "expected_context", "solution", "reference_solution", "hints", "hint_level_2", "hint_level_3",
        }}

    events = session.query(AnswerSnapshotEvent).filter_by(snapshot_id=row.id).order_by(AnswerSnapshotEvent.id).all()
    return {"id": row.id, "source": row.source, "created_at": iso_utc(row.source_created_at),
            "can_generate": bool(row.snapshot.get("question") or row.snapshot.get("question_context") or row.snapshot.get("artifacts")),
            "has_analysis": service.analysis_event(session, row) is not None,
            "has_solution": bool(row.snapshot.get("solution") or any(e.kind == "solution" for e in events)),
            "snapshot": visible(row.snapshot), "events": [
                {"kind": e.kind, "created_at": iso_utc(e.created_at), "payload": visible(e.payload)} for e in events
            ]}


@router.post("/answer-history/{record_id}/analysis/job")
def generate_history_analysis(record_id: int, session: Db):
    record = session.get(AnswerSnapshot, record_id)
    if record is None:
        raise HTTPException(404, "Answer snapshot not found")
    service.lock_snapshot(session, record)
    if service.analysis_event(session, record):
        session.rollback()
        return {"cached": True}
    from app import models
    from app.submissions.models import Submission

    source = session.get(models.Attempt if record.source_type == "attempt" else Submission, record.source_id)
    if source is not None and source.created_at == record.source_created_at:
        if record.source_type == "attempt":
            from app.course_quiz.router import answer_analysis_job
            from app.course_quiz.schemas import AnswerAnalysisInput

            return answer_analysis_job(source.quiz_item_id, AnswerAnalysisInput(attempt_id=source.id), session)
        from app.submissions.router import trigger_review_job

        return trigger_review_job(source.id, session, True)

    from app.jobs.service import create_job, find_live_job, run_in_background

    live = find_live_job(session, "answer_history_analysis", "answer_snapshot", record_id)
    if live:
        session.rollback()
        return {"job_id": live.id, "resumed": True}
    if not record.snapshot.get("question") and not record.snapshot.get("question_context") and not record.snapshot.get("artifacts"):
        raise HTTPException(409, "The original question is unavailable; this answer cannot be analysed reliably.")
    job = create_job(session, "answer_history_analysis", ref_type="answer_snapshot", ref_id=record_id)
    run_in_background(job.id, lambda job_id: _analyse_archived(record_id, job_id))
    return {"job_id": job.id}


@router.post("/answer-history/{record_id}/solution/job")
def generate_history_solution(record_id: int, session: Db):
    record = session.get(AnswerSnapshot, record_id)
    if record is None:
        raise HTTPException(404, "Answer snapshot not found")
    service.lock_snapshot(session, record)
    if record.snapshot.get("solution") or session.query(AnswerSnapshotEvent.id).filter_by(snapshot_id=record_id, kind="solution").first():
        session.rollback()
        return {"cached": True}
    if not (record.snapshot.get("question") or record.snapshot.get("question_context")):
        raise HTTPException(409, "The original question is unavailable; an explanation cannot be generated reliably.")
    from app.jobs.service import create_job, find_live_job, run_in_background

    live = find_live_job(session, "answer_history_solution", "answer_snapshot", record_id)
    if live:
        session.rollback()
        return {"job_id": live.id, "resumed": True}
    job = create_job(session, "answer_history_solution", ref_type="answer_snapshot", ref_id=record_id)
    run_in_background(job.id, lambda job_id: _analyse_archived(record_id, job_id, "solution"))
    return {"job_id": job.id}


def _analyse_archived(record_id: int, job_id: str, output_kind: str = "analysis"):
    """An archived source can still be reviewed using its independent snapshot."""
    import uuid

    from app.db import SessionLocal
    from app.jobs.models import Job
    from app.jobs.service import complete_job, fail_job
    from app.llm import get_provider
    from app.metering import CostLimitExceeded, MeteredLLM
    from app.submissions.llm_review import ReviewContext, review_with_model

    with SessionLocal() as session:
        record = session.get(AnswerSnapshot, record_id)
        data = record.snapshot
        source_type = record.source_type
    question = data.get("question") or data.get("question_context")
    if not data.get("complete"):
        question = f"Legacy answer: original question was not saved. Available current context (may differ):\n{question}"
    try:
        if output_kind == "solution":
            from app.course_quiz.router import SOLUTION_SYSTEM

            prompt = f"QUESTION:\n{question}\nREFERENCE:\n{data.get('expected', data.get('expected_context', '(not saved)'))}"
            solution = MeteredLLM(get_provider(), uuid.uuid4().hex, job_id=job_id).generate(
                "quiz_solution", SOLUTION_SYSTEM, prompt, max_tokens=4000,
            ).strip()
            if not solution:
                raise ValueError("Empty explanation")
            payload, kind = {"solution": solution}, "solution"
        elif source_type == "submission":
            review = review_with_model(ReviewContext(
                exercise_id=None, user_note=data.get("user_note"), question=question,
                artifacts=[(a["filename"], a["kind"], a["content"] or "") for a in data.get("artifacts", [])],
            ), job_id=job_id)
            if review is None:
                raise ValueError("Unusable model review")
            payload = {**review.model_dump(), "llm_status": "used", "model": "llm"}
            kind = "code_review"
        else:
            from app.attachments.service import material_for
            from app.course_quiz.router import ANALYSIS_SYSTEM

            with SessionLocal() as session:
                text, images = material_for(session, [a["id"] for a in data.get("attachments", [])])
            prompt = (f"QUESTION:\n{question}\nREFERENCE ANSWER:\n{data.get('expected', '')}\n"
                      f"LEARNER'S ANSWER:\n{data.get('submitted_answer', '')}\n"
                      f"VERDICT: {data.get('correct')}\nATTACHMENTS:\n{text}")
            raw = MeteredLLM(get_provider(), uuid.uuid4().hex, job_id=job_id).generate(
                "quiz_answer_analysis", ANALYSIS_SYSTEM, prompt, max_tokens=2000, images=images or None,
            )
            if not raw.strip():
                raise ValueError("Empty analysis")
            payload, kind = {"analysis": raw.strip()}, "answer_analysis"
    except CostLimitExceeded:
        fail_job(job_id, "Model budget exceeded.")
        return
    except Exception:
        import logging

        logging.getLogger(__name__).exception("history_analysis_failed record_id=%s job_id=%s", record_id, job_id)
        fail_job(job_id, "AI analysis failed. Please retry.")
        return
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job.status == "cancelled":
            return
        record = session.get(AnswerSnapshot, record_id)
        service.append_event(session, record, f"job:{job_id}", kind, payload)
        session.commit()
    complete_job(job_id, {"record_id": record_id, **payload})
