"""Course question bank: aggregate a course's quiz items, and ask the model for more."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.orm import Session, selectinload
from typing import Annotated

from collections import defaultdict

from app import models
from app.attempts import _attempt_state
from app.course_quiz import quizgen
from app.course_quiz.schemas import (
    QUIZ_KINDS,
    QuizBank,
    QuizBankItem,
    QuizBankLesson,
    QuizBankModule,
    QuizGenerateInput,
    QuizGenerateResult,
)
from app.db import get_session
from app.llm import get_provider
from app.llm.base import LLMCallError
from app.metering import CostLimitExceeded, MeteredLLM

logger = logging.getLogger("studyforge.course_quiz")

router = APIRouter(prefix="/api", tags=["course-quiz"])
Db = Annotated[Session, Depends(get_session)]
CourseId = Annotated[int, Path(gt=0)]
MUTATION = []  # local single-user app; kept as a named hook like other routers


def _course_or_404(session: Session, course_id: int) -> models.Course:
    row = (
        session.query(models.Course)
        .options(
            selectinload(models.Course.modules).selectinload(models.Module.lessons).selectinload(models.Lesson.quiz_items)
        )
        .filter(models.Course.id == course_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Course not found")
    return row


def _bank(session: Session, course: models.Course) -> QuizBank:
    item_ids = [
        item.id
        for module in course.modules
        for lesson in module.lessons
        for item in lesson.quiz_items
    ]
    grouped: dict[int, list] = defaultdict(list)
    if item_ids:
        for row in (
            session.query(models.Attempt)
            .filter(models.Attempt.quiz_item_id.in_(item_ids))
            .order_by(models.Attempt.quiz_item_id, models.Attempt.attempt_no)
            .all()
        ):
            grouped[row.quiz_item_id].append(row)
    modules = []
    total = 0
    for module in sorted(course.modules, key=lambda m: (m.position, m.id)):
        lessons = []
        for lesson in sorted(module.lessons, key=lambda l: (l.position, l.id)):
            items = [
                QuizBankItem(
                    id=item.id,
                    question=item.question,
                    kind=item.kind,
                    options=item.options or [],
                    concept=item.concept or "",
                    attempt_state=_attempt_state(grouped[item.id]),
                )
                for item in sorted(lesson.quiz_items, key=lambda i: i.id)
            ]
            total += len(items)
            lessons.append(QuizBankLesson(id=lesson.id, title=lesson.title, items=items))
        modules.append(QuizBankModule(id=module.id, title=module.title, lessons=lessons))
    return QuizBank(course_id=course.id, total=total, modules=modules)


@router.get("/courses/{course_id}/quiz", response_model=QuizBank)
def course_quiz_bank(course_id: CourseId, session: Db):
    """Every quiz item in the course, grouped by module and lesson.

    Answers are deliberately absent: the existing /quiz/{item_id}/answer route
    is the only place an answer key appears, after an attempt.
    """
    return _bank(session, _course_or_404(session, course_id))


@router.get("/quiz/{item_id}", response_model=QuizBankItem)
def quiz_item(item_id: int, session: Db):
    """One quiz question, for the code-question detail page.

    The answer key is absent (same rule as the bank): it appears only via
    /quiz/{item_id}/answer after an attempt.
    """
    from app.models import QuizItem

    item = session.get(QuizItem, item_id)
    if not item:
        raise HTTPException(404, "Quiz item not found")
    return QuizBankItem.model_validate(item)


@router.post("/quiz/{item_id}/solution/job")
def generate_solution_job(item_id: int, session: Db):
    """Start reference-solution generation as a background job.

    Returns {job_id} immediately. On completion job.result.solution holds the
    markdown. Poll GET /api/jobs/{id}. Navigating away does NOT cancel it.
    """
    from app.jobs.service import create_job, run_in_background

    item = session.get(models.QuizItem, item_id)
    if not item:
        raise HTTPException(404, "Quiz item not found")
    if item.solution:
        # Already have one; return a completed job pointing at it.
        job = create_job(session, "quiz_solution", ref_type="quiz", ref_id=item_id)
        from app.jobs.service import complete_job

        complete_job(job.id, {"item_id": item.id, "solution": item.solution})
        return {"job_id": job.id}

    job = create_job(session, "quiz_solution", ref_type="quiz", ref_id=item_id)
    kind_snap = item.kind
    question_snap = item.question
    answer_snap = item.answer

    def _run(job_id: str):
        from app import models as _m
        from app.db import SessionLocal
        from app.jobs.models import Job as _Job
        from app.jobs.service import complete_job, fail_job, update_progress
        from app.llm import get_provider as _get_provider
        from app.llm.base import LLMCallError
        from app.metering import CostLimitExceeded, MeteredLLM, cost_limit_detail

        update_progress(job_id, {"stage": "generating"})
        prompt = (
            f"Question kind: {kind_snap}\n"
            f"Question:\n{question_snap}\n\n"
            f"Correct answer:\n{answer_snap or '(none)'}\n"
        )
        try:
            meter = MeteredLLM(_get_provider(), uuid.uuid4().hex, job_id=job_id)
            raw: str = meter.generate(
                "quiz_solution", SOLUTION_SYSTEM, prompt, max_tokens=4000
            )
        except CostLimitExceeded as exc:
            fail_job(job_id, f"Cost limit exceeded: {cost_limit_detail(exc)}")
            return
        except LLMCallError as exc:
            fail_job(job_id, str(exc))
            return
        solution = (raw or "").strip()
        if not solution:
            fail_job(job_id, "The model did not return a solution.")
            return
        with SessionLocal() as s:
            j = s.get(_Job, job_id)
            if j and j.status == "cancelled":
                return
            it = s.get(_m.QuizItem, item_id)
            if it:
                it.solution = solution
                s.commit()
            complete_job(job_id, {"item_id": item_id, "solution": solution})

    run_in_background(job.id, _run)
    return {"job_id": job.id}


@router.post("/quiz/{item_id}/solution")
def generate_solution(
    item_id: int, session: Db, refresh: bool = Query(default=False)
):
    """Generate the AI reference solution for one question, on demand.

    The solution is written AFTER the question exists: the question, its kind
    and the answer key go into the prompt, and the model writes a step-by-step
    explanation. Stored on the quiz item; a repeat call returns the stored copy
    unless refresh=true.
    """
    from app.llm.base import LLMCallError
    from app.metering import CostLimitExceeded, MeteredLLM, cost_limit_detail

    item = session.get(models.QuizItem, item_id)
    if not item:
        raise HTTPException(404, "Quiz item not found")
    if item.solution and not refresh:
        return {"item_id": item.id, "solution": item.solution}

    prompt = (
        f"Question kind: {item.kind}\n"
        f"Question:\n{item.question}\n\n"
        f"Correct answer:\n{item.answer or '(none)'}\n"
    )
    from app.llm import get_provider as _get_provider

    meter = MeteredLLM(_get_provider(), uuid.uuid4().hex)
    try:
        raw: str = meter.generate(
            "quiz_solution",
            SOLUTION_SYSTEM,
            prompt,
            max_tokens=4000,
        )
    except CostLimitExceeded as exc:
        raise HTTPException(402, detail=cost_limit_detail(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(502, str(exc)) from exc
    solution = (raw or "").strip()
    if not solution:
        raise HTTPException(502, "The model did not return a solution.")
    item.solution = solution
    session.commit()
    return {"item_id": item.id, "solution": solution}


SOLUTION_SYSTEM = """You are a teacher writing a reference solution for a quiz question.
Given the question, its kind, and the correct answer, write a clear step-by-step
solution that teaches the learner HOW to arrive at the answer. For code questions,
include the key code with brief comments. Use markdown. Be concise but complete."""


@router.post("/courses/{course_id}/quiz/generate/job")
def generate_quiz_job(course_id: CourseId, body: QuizGenerateInput, session: Db):
    """Start AI question generation as a background job.

    Returns {job_id} immediately. On completion job.result.created holds the
    new question ids. Poll GET /api/jobs/{id}. Navigating away does NOT cancel it.
    """
    from app.jobs.service import create_job, run_in_background

    # Validate synchronously so bad input fails fast.
    course = _course_or_404(session, course_id)
    requests: list[tuple[str, int]] = []
    for entry in body.items:
        if entry.kind not in QUIZ_KINDS:
            raise HTTPException(422, f"Unknown question kind {entry.kind!r}.")
        if entry.count > 0:
            requests.append((entry.kind, entry.count))
    if not requests:
        raise HTTPException(422, "Ask for at least one question.")
    if sum(count for _, count in requests) > quizgen.MAX_TOTAL_ITEMS:
        raise HTTPException(422, f"At most {quizgen.MAX_TOTAL_ITEMS} questions per call.")
    lesson_id = body.lesson_id
    if lesson_id is not None:
        target = session.get(models.Lesson, lesson_id)
        if not target:
            raise HTTPException(404, "Lesson not found")

    job = create_job(
        session, "quiz_generate", ref_type="course", ref_id=course_id,
    )
    items_spec = [{"kind": k, "count": c} for k, c in requests]
    user_prompt = (body.prompt or "").strip() or None

    def _run(job_id: str):
        from app import models as _m
        from app.db import SessionLocal
        from app.jobs.models import Job as _Job
        from app.jobs.service import complete_job, fail_job, update_progress
        from app.llm import get_provider as _get_provider
        from app.llm.base import LLMCallError
        from app.metering import CostLimitExceeded, MeteredLLM, cost_limit_detail

        update_progress(job_id, {"stage": "generating"})
        with SessionLocal() as s:
            c = s.get(_m.Course, course_id)
            if lesson_id is not None:
                tl = s.get(_m.Lesson, lesson_id)
                material = tl.content or ""
                lesson_title = tl.title
                home_id = tl.id
            else:
                parts = []
                for module in sorted(c.modules, key=lambda m: (m.position, m.id)):
                    for lesson in sorted(module.lessons, key=lambda l: (l.position, l.id)):
                        if lesson.content:
                            parts.append(f"## {lesson.title}\n{lesson.content}")
                material = "\n\n".join(parts)
                lesson_title = None
                home_id = None
        if not material.strip():
            fail_job(job_id, "There is no lesson text to write questions from.")
            return
        material = material[: quizgen.MAX_MATERIAL_CHARS]
        prompt = quizgen.build_prompt(
            material,
            [(e["kind"], e["count"]) for e in items_spec],
            lesson_title,
            user_prompt,
        )
        try:
            meter = MeteredLLM(_get_provider(), uuid.uuid4().hex, course_id=course_id, job_id=job_id)
            raw = meter.generate(quizgen.QUIZGEN_STAGE, _quizgen_system(), prompt)
        except CostLimitExceeded as exc:
            fail_job(job_id, f"Cost limit exceeded: {cost_limit_detail(exc)}")
            return
        except LLMCallError as exc:
            fail_job(job_id, str(exc))
            return
        parsed = quizgen.parse_items(raw, [(e["kind"], e["count"]) for e in items_spec])
        if not parsed:
            fail_job(job_id, "The model did not return usable questions.")
            return
        with SessionLocal() as s:
            j = s.get(_Job, job_id)
            if j and j.status == "cancelled":
                return
            c = s.get(_m.Course, course_id)
            if home_id is None:
                # First lesson of the course.
                for module in sorted(c.modules, key=lambda m: (m.position, m.id)):
                    lessons = sorted(module.lessons, key=lambda l: (l.position, l.id))
                    if lessons:
                        home_id = lessons[0].id
                        break
            created = []
            for entry in parsed:
                row = _m.QuizItem(
                    lesson_id=home_id,
                    question=entry["question"],
                    kind=entry["kind"],
                    options=entry["options"],
                    answer=entry["answer"],
                    concept=entry["concept"],
                )
                s.add(row)
                s.flush()
                created.append(row.id)
            s.commit()
        complete_job(job_id, {"course_id": course_id, "created": created})

    run_in_background(job.id, _run)
    return {"job_id": job.id}


@router.post("/courses/{course_id}/quiz/generate", response_model=QuizGenerateResult, status_code=201)
def generate_quiz_questions(course_id: CourseId, body: QuizGenerateInput, session: Db):
    """Ask the model for more practice questions.

    Each entry of `items` names a kind and how many of it, so one call can mix
    e.g. 选择题 and 代码题. Unknown kinds are refused; a total over the cap is
    refused; per-kind counts of zero are simply skipped.
    """
    course = _course_or_404(session, course_id)

    requests: list[tuple[str, int]] = []
    for entry in body.items:
        if entry.kind not in QUIZ_KINDS:
            raise HTTPException(
                422,
                f"Unknown question kind {entry.kind!r}. Supported: {', '.join(QUIZ_KINDS)}.",
            )
        if entry.count > 0:
            requests.append((entry.kind, entry.count))
    if not requests:
        raise HTTPException(422, "Ask for at least one question.")
    if sum(count for _, count in requests) > quizgen.MAX_TOTAL_ITEMS:
        raise HTTPException(422, f"At most {quizgen.MAX_TOTAL_ITEMS} questions per call.")

    target_lesson: models.Lesson | None = None
    if body.lesson_id is not None:
        target_lesson = session.get(models.Lesson, body.lesson_id)
        if not target_lesson:
            raise HTTPException(404, "Lesson not found")
        # The lesson must belong to this course; a cross-course id is a caller bug.
        module_ids = {m.id for m in course.modules}
        if target_lesson.module_id not in module_ids:
            raise HTTPException(422, "Lesson does not belong to this course.")
        material = target_lesson.content or ""
        lesson_title = target_lesson.title
    else:
        parts = []
        for module in sorted(course.modules, key=lambda m: (m.position, m.id)):
            for lesson in sorted(module.lessons, key=lambda l: (l.position, l.id)):
                if lesson.content:
                    parts.append(f"## {lesson.title}\n{lesson.content}")
        material = "\n\n".join(parts)
        lesson_title = None
    if not material.strip():
        raise HTTPException(422, "There is no lesson text to write questions from.")
    material = material[: quizgen.MAX_MATERIAL_CHARS]

    prompt = quizgen.build_prompt(material, requests, lesson_title)
    run_id = uuid.uuid4().hex
    meter = MeteredLLM(get_provider(), run_id, course_id=course.id)
    try:
        raw = meter.generate(quizgen.QUIZGEN_STAGE, _quizgen_system(), prompt)
    except CostLimitExceeded as exc:
        from app.metering import cost_limit_detail

        raise HTTPException(402, detail=cost_limit_detail(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(502, str(exc)) from exc
    parsed = quizgen.parse_items(raw, requests)
    if not parsed:
        raise HTTPException(502, "The model did not return usable questions.")

    home = target_lesson or _first_lesson(course)
    created = []
    for entry in parsed:
        row = models.QuizItem(
            lesson_id=home.id,
            question=entry["question"],
            kind=entry["kind"],
            options=entry["options"],
            answer=entry["answer"],
            concept=entry["concept"],
        )
        session.add(row)
        created.append(row)
    session.commit()
    for row in created:
        session.refresh(row)
    return QuizGenerateResult(
        course_id=course.id,
        lesson_id=target_lesson.id if target_lesson else None,
        created=[
            QuizBankItem(
                id=row.id, question=row.question, kind=row.kind,
                options=row.options or [], concept=row.concept or "",
            )
            for row in created
        ],
    )


@router.post(
    "/courses/{course_id}/quiz/{item_id}/variant",
    status_code=201,
    dependencies=MUTATION,
)
def create_variant_job(course_id: CourseId, item_id: int, session: Db):
    """Start question variant generation as a background job.

    Returns {job_id} immediately. On completion job.result holds the new
    question {id, question, kind, options, concept}. Poll GET /api/jobs/{id}.
    Navigating away does NOT cancel it.
    """
    from app.jobs.service import create_job, run_in_background

    course = _course_or_404(session, course_id)
    item = session.get(models.QuizItem, item_id)
    if not item:
        raise HTTPException(404, "Quiz item not found")
    module_ids = {m.id for m in course.modules}
    lesson = session.get(models.Lesson, item.lesson_id)
    if not lesson or lesson.module_id not in module_ids:
        raise HTTPException(422, "Question does not belong to this course.")

    job = create_job(session, "quiz_variant", ref_type="course", ref_id=course_id)
    item_id_snap = item.id
    lesson_id_snap = lesson.id
    kind_snap = item.kind
    question_snap = item.question
    answer_snap = item.answer

    def _run(job_id: str):
        from app import models as _m
        from app.db import SessionLocal
        from app.jobs.models import Job as _Job
        from app.jobs.service import complete_job, fail_job, update_progress
        from app.llm import get_provider as _get_provider
        from app.llm.base import LLMCallError
        from app.metering import CostLimitExceeded, MeteredLLM, cost_limit_detail

        update_progress(job_id, {"stage": "generating"})
        with SessionLocal() as s:
            attempts = (
                s.query(_m.Attempt)
                .filter_by(quiz_item_id=item_id_snap)
                .order_by(_m.Attempt.attempt_no)
                .all()
            )
            attempt_dicts = [
                {
                    "attempt_no": a.attempt_no,
                    "correct": a.correct,
                    "submitted_answer": (a.submitted_answer or "")[:500],
                }
                for a in attempts
            ]

            class _Item:
                kind = kind_snap
                question = question_snap
                answer = answer_snap

            prompt = quizgen.build_variant_prompt(_Item(), attempt_dicts)
        try:
            meter = MeteredLLM(_get_provider(), uuid.uuid4().hex, course_id=course_id, job_id=job_id)
            raw = meter.generate(quizgen.VARIANT_STAGE, _quizgen_system(), prompt)
        except CostLimitExceeded as exc:
            fail_job(job_id, f"Cost limit exceeded: {cost_limit_detail(exc)}")
            return
        except LLMCallError as exc:
            fail_job(job_id, str(exc))
            return
        parsed = quizgen.parse_items(raw, [(kind_snap, 1)])
        if not parsed:
            fail_job(job_id, "The model did not return a usable variant.")
            return
        with SessionLocal() as s:
            j = s.get(_Job, job_id)
            if j and j.status == "cancelled":
                return
            entry = parsed[0]
            row = _m.QuizItem(
                lesson_id=lesson_id_snap,
                question=entry["question"],
                kind=entry["kind"],
                options=entry["options"],
                answer=entry["answer"],
                concept=entry["concept"],
            )
            s.add(row)
            s.commit()
            s.refresh(row)
            complete_job(
                job_id,
                {
                    "id": row.id,
                    "question": row.question,
                    "kind": row.kind,
                    "options": row.options or [],
                    "concept": row.concept or "",
                },
            )

    run_in_background(job.id, _run)
    return {"job_id": job.id}


# The job route must be registered before the sync route's decorator.
_router_post = router.post


@_router_post(
    "/courses/{course_id}/quiz/{item_id}/variant/job",
    status_code=201,
    dependencies=MUTATION,
)
def _create_variant_job_route(course_id: CourseId, item_id: int, session: Db):
    return create_variant_job(course_id, item_id, session)


def create_variant(course_id: CourseId, item_id: int, session: Db):
    """One variant of a question, saved into the same lesson's bank.

    Same kind and knowledge point, different surface form — for when the
    learner wants another rep on the idea they just missed.
    """
    course = _course_or_404(session, course_id)
    item = session.get(models.QuizItem, item_id)
    if not item:
        raise HTTPException(404, "Quiz item not found")
    module_ids = {m.id for m in course.modules}
    lesson = session.get(models.Lesson, item.lesson_id)
    if not lesson or lesson.module_id not in module_ids:
        raise HTTPException(422, "Question does not belong to this course.")

    # The learner's answer history shapes the variant: target the misconception.
    attempts = (
        session.query(models.Attempt)
        .filter_by(quiz_item_id=item.id)
        .order_by(models.Attempt.attempt_no)
        .all()
    )
    attempt_dicts = [
        {
            "attempt_no": a.attempt_no,
            "correct": a.correct,
            "submitted_answer": (a.submitted_answer or "")[:500],
        }
        for a in attempts
    ]
    prompt = quizgen.build_variant_prompt(item, attempt_dicts)
    run_id = uuid.uuid4().hex
    meter = MeteredLLM(get_provider(), run_id, course_id=course.id)
    try:
        raw = meter.generate(quizgen.VARIANT_STAGE, _quizgen_system(), prompt)
    except CostLimitExceeded as exc:
        from app.metering import cost_limit_detail

        raise HTTPException(402, detail=cost_limit_detail(exc)) from exc
    except LLMCallError as exc:
        raise HTTPException(502, str(exc)) from exc
    parsed = quizgen.parse_items(raw, [(item.kind, 1)])
    if not parsed:
        raise HTTPException(502, "The model did not return a usable variant.")
    entry = parsed[0]
    row = models.QuizItem(
        lesson_id=lesson.id,
        question=entry["question"],
        kind=entry["kind"],
        options=entry["options"],
        answer=entry["answer"],
        concept=entry["concept"],
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return QuizBankItem(
        id=row.id, question=row.question, kind=row.kind,
        options=row.options or [], concept=row.concept or "",
    )


def _first_lesson(course: models.Course) -> models.Lesson:
    for module in sorted(course.modules, key=lambda m: (m.position, m.id)):
        lessons = sorted(module.lessons, key=lambda l: (l.position, l.id))
        if lessons:
            return lessons[0]
    raise HTTPException(422, "The course has no lessons.")


def _quizgen_system() -> str:
    return (
        "你是编程课程的出题老师，只按要求的 JSON 数组出题，不写解释，"
        "不泄露与题目无关的内容。"
    )
