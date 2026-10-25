"""Capture answers in the source transaction; append later AI outputs separately."""

from sqlalchemy.orm import Session, object_session

from app import models
from app.answer_history.models import AnswerSnapshot, AnswerSnapshotEvent
from app.attempts import iso_utc


def question_snapshot(item: models.QuizItem) -> dict:
    lesson = item.lesson
    from app.jobs.models import Job

    session = object_session(item)
    hints = []
    if session:
        for job in session.query(Job).filter_by(type="quiz_hint", ref_type="quiz", ref_id=item.id, status="completed").order_by(Job.created_at).all():
            result = job.result or {}
            if result.get("question") == item.question and result.get("expected") == item.answer:
                hints.append({"level": result["level"], "hint": result["hint"]})
    return {
        "question": item.question, "kind": item.kind, "options": list(item.options or []),
        "expected": item.answer, "solution": item.solution, "concept": item.concept,
        "course_title": lesson.module.course.title, "lesson_title": lesson.title,
        "course_created_at": iso_utc(lesson.module.course.created_at),
        "hints": hints,
    }


def find_source(session: Session, source_type: str, row) -> AnswerSnapshot | None:
    return session.query(AnswerSnapshot).filter_by(
        source_type=source_type, source_id=row.id, source_created_at=row.created_at,
    ).first()


def capture_attempt(session: Session, row: models.Attempt, *, question: dict | None = None,
                    feedback: str | None = None, legacy: bool = False) -> AnswerSnapshot:
    existing = find_source(session, "attempt", row)
    if existing:
        return existing
    item = session.get(models.QuizItem, row.quiz_item_id)
    lesson = session.get(models.Lesson, row.lesson_id)
    from app.attachments.service import summaries

    data = ({"question_context": item.question, "kind": item.kind} if item else {}) if legacy else question or (question_snapshot(item) if item else {})
    data = {**data, "expected": row.expected_answer, "submitted_answer": row.submitted_answer,
            "correct": row.correct, "feedback": feedback, "attempt_no": row.attempt_no,
            "attachments": summaries(session, list(row.attachment_ids or [])),
            "complete": not legacy, "grader": row.grader}
    if lesson:
        data["course_created_at"] = iso_utc(lesson.module.course.created_at)
    record = AnswerSnapshot(
        source_type="attempt", source_id=row.id, source_created_at=row.created_at,
        question_id=row.quiz_item_id, lesson_id=row.lesson_id,
        course_id=lesson.module.course_id if lesson else None,
        source=row.source, snapshot=data,
    )
    session.add(record)
    session.flush()
    return record


def capture_submission(session: Session, row, *, legacy: bool = False) -> AnswerSnapshot:
    existing = find_source(session, "submission", row)
    if existing:
        return existing
    item = session.get(models.QuizItem, row.quiz_item_id) if row.quiz_item_id else None
    data = ({"question_context": item.question, "kind": item.kind, "expected_context": item.answer} if item else {}) if legacy else question_snapshot(item) if item else {}
    if item is None and row.variant_id:
        from app.submissions.models import VariantExercise

        variant = session.get(VariantExercise, row.variant_id)
        if variant:
            data = {"question_context" if legacy else "question": variant.prompt, "kind": "code",
                    "expected_context" if legacy else "expected": variant.acceptance,
                    "variant_id": variant.id, "options": []}
    data = {**data, "user_note": row.user_note, "version": row.version,
            "artifacts": [{"filename": a.filename, "kind": a.kind, "content": a.content,
                           "sha256": a.sha256, "size_bytes": a.size_bytes} for a in row.artifacts],
            "complete": not legacy, "project_id": row.project_id, "variant_id": row.variant_id}
    if item:
        data["course_created_at"] = iso_utc(item.lesson.module.course.created_at)
    record = AnswerSnapshot(
        source_type="submission", source_id=row.id, source_created_at=row.created_at,
        question_id=row.quiz_item_id, lesson_id=item.lesson_id if item else None,
        course_id=item.lesson.module.course_id if item else None,
        source="code_submission", snapshot=data,
    )
    session.add(record)
    session.flush()
    return record


def append_event(session: Session, record: AnswerSnapshot, key: str, kind: str,
                 payload: dict, created_at=None) -> None:
    if session.query(AnswerSnapshotEvent.id).filter_by(event_key=key).first():
        return
    event = AnswerSnapshotEvent(snapshot_id=record.id, event_key=key, kind=kind, payload=payload)
    if created_at is not None:
        event.created_at = created_at
    session.add(event)
    session.flush()


def capture_review(session: Session, review) -> None:
    from app.submissions.models import Submission

    sub = session.get(Submission, review.submission_id)
    record = find_source(session, "submission", sub) or capture_submission(session, sub, legacy=True)
    append_event(session, record, f"review:{review.id}:{review.created_at.isoformat()}", "code_review", {
        "summary": review.summary, "findings": review.findings, "model": review.model,
        "llm_status": review.llm_status, "hint_level_1": review.hint_level_1,
        "hint_level_2": review.hint_level_2, "hint_level_3": review.hint_level_3,
        "reference_solution": review.reference_solution, "solution_label": review.solution_label,
    }, review.created_at)


def capture_analysis(session: Session, attempt, analysis: str, key: str) -> None:
    record = find_source(session, "attempt", attempt) or capture_attempt(session, attempt, legacy=True)
    append_event(session, record, key, "answer_analysis", {"analysis": analysis})


def analysis_for(session: Session, attempt) -> str | None:
    record = find_source(session, "attempt", attempt)
    if record is None:
        return None
    event = session.query(AnswerSnapshotEvent).filter_by(
        snapshot_id=record.id, kind="answer_analysis",
    ).order_by(AnswerSnapshotEvent.id.desc()).first()
    return event.payload["analysis"] if event else None


def lock_snapshot(session: Session, record: AnswerSnapshot) -> None:
    session.query(AnswerSnapshot).filter_by(id=record.id).update({AnswerSnapshot.id: AnswerSnapshot.id})


def analysis_event(session: Session, record: AnswerSnapshot):
    events = session.query(AnswerSnapshotEvent).filter(
        AnswerSnapshotEvent.snapshot_id == record.id,
        AnswerSnapshotEvent.kind.in_(["answer_analysis", "code_review"]),
    ).order_by(AnswerSnapshotEvent.id.desc()).all()
    return next((e for e in events if e.kind == "answer_analysis" or e.payload.get("llm_status") == "used"), None)


def capture_question_event(session: Session, item_id: int, question: str, expected: str,
                           key: str, kind: str, payload: dict) -> None:
    # A regenerated question's explanation must never be attached to an older version.
    for record in session.query(AnswerSnapshot).filter_by(question_id=item_id).all():
        if record.snapshot.get("question") == question and record.snapshot.get("expected") == expected:
            append_event(session, record, f"{key}:{record.id}", kind, payload)


def backfill(session: Session) -> None:
    """Preserve only recoverable old evidence; never substitute today's question/key."""
    from app.jobs.models import Job
    from app.submissions.models import CodeReview, Submission

    for row in session.query(models.Attempt).filter(~session.query(AnswerSnapshot.id).filter(
        AnswerSnapshot.source_type == "attempt", AnswerSnapshot.source_id == models.Attempt.id,
        AnswerSnapshot.source_created_at == models.Attempt.created_at,
    ).exists()).yield_per(200):
        capture_attempt(session, row, legacy=True)
    for row in session.query(Submission).filter(~session.query(AnswerSnapshot.id).filter(
        AnswerSnapshot.source_type == "submission", AnswerSnapshot.source_id == Submission.id,
        AnswerSnapshot.source_created_at == Submission.created_at,
    ).exists()).yield_per(200):
        capture_submission(session, row, legacy=True)
    for review in session.query(CodeReview).yield_per(200):
        capture_review(session, review)
    for job in session.query(Job).filter(Job.status == "completed", Job.type.in_(
        ["quiz_grade", "quiz_answer_analysis"],
    )).yield_per(200):
        result = job.result or {}
        attempt = session.get(models.Attempt, result.get("attempt_id")) if result.get("attempt_id") else None
        if attempt is None or attempt.quiz_item_id != job.ref_id:
            continue
        record = find_source(session, "attempt", attempt)
        if job.type == "quiz_answer_analysis" and result.get("analysis"):
            append_event(session, record, f"job:{job.id}", "answer_analysis", {"analysis": result["analysis"]}, job.updated_at)
        elif result.get("feedback"):
            append_event(session, record, f"job:{job.id}", "grading_feedback", {"feedback": result["feedback"]}, job.updated_at)
