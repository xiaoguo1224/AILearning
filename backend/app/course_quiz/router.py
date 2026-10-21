"""Course question bank: aggregate a course's quiz items, and ask the model for more."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Path
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

    prompt = quizgen.build_variant_prompt(item)
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
