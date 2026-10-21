"""Markdown-folder course import and manual content editing."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from app import models
from app.course_content import importer
from app.course_content.schemas import (
    CoursePatch,
    ImportRequest,
    ImportResult,
    LessonPatch,
)
from app.db import get_session

logger = logging.getLogger("studyforge.course_content")

router = APIRouter(prefix="/api", tags=["course-content"])
Db = Annotated[Session, Depends(get_session)]
CourseId = Annotated[int, Path(gt=0)]
LessonId = Annotated[int, Path(gt=0)]


@router.post("/courses/import", response_model=ImportResult, status_code=201)
def import_course(body: ImportRequest, session: Db):
    """Create a course straight from a folder of markdown files.

    No AI generation: folders become modules, .md files become lessons, in the
    order their numeric prefixes give. Questions can be added afterwards with
    the question bank's AI 出题.
    """
    try:
        tree = importer.parse_tree([f.model_dump() for f in body.files])
    except importer.ImportError as exc:
        raise HTTPException(422, str(exc)) from exc

    title = body.title.strip() if body.title and body.title.strip() else tree["title"]
    description = (
        body.description.strip()
        if body.description and body.description.strip()
        else tree["description"]
    )
    course = models.Course(title=title, description=description)
    session.add(course)
    session.flush()
    lesson_count = 0
    for mi, module in enumerate(tree["modules"]):
        mod = models.Module(course_id=course.id, title=module["title"], position=mi)
        session.add(mod)
        session.flush()
        for li, lesson in enumerate(module["lessons"]):
            session.add(
                models.Lesson(
                    module_id=mod.id,
                    title=lesson["title"],
                    position=li,
                    content=lesson["content"],
                    concepts=[],
                )
            )
            lesson_count += 1
    session.commit()
    logger.info(
        "imported course %r from %d files: %d modules, %d lessons",
        title,
        len(body.files),
        len(tree["modules"]),
        lesson_count,
    )
    # Auto-extract concepts via AI in the background.
    try:
        from app.jobs import service as jobs
        from app.concept_extract.router import _run_extraction
        job = jobs.create_job(
            session,
            job_type="concept_extract",
            ref_type="course",
            ref_id=course.id,
        )
        def _run(jid: str):
            _run_extraction(jid, course.id)
        jobs.run_in_background(job.id, _run)
    except Exception:
        pass
    return ImportResult(
        id=course.id, title=title, modules=len(tree["modules"]), lessons=lesson_count
    )


@router.patch("/lessons/{lesson_id}")
def patch_lesson(lesson_id: LessonId, body: LessonPatch, session: Db):
    """Manually edit a lesson's title, content, or concepts.

    Imported and generated lessons alike are editable; the quiz items already
    on the lesson are untouched.
    """
    if body.title is None and body.content is None and body.concepts is None:
        raise HTTPException(422, "Nothing to update.")
    lesson = session.get(models.Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    if body.title is not None:
        lesson.title = body.title.strip()
    if body.content is not None:
        lesson.content = body.content
    if body.concepts is not None:
        lesson.concepts = [c.strip() for c in body.concepts if c.strip()][:20]
    session.commit()
    # Auto re-extract project graphs containing this lesson's course.
    try:
        from app.project_graph.trigger import trigger_graph_extract
        course_id = lesson.module.course_id if lesson.module else None
        if course_id:
            from app.projects.models import ProjectCourse
            pids = [r[0] for r in session.query(ProjectCourse.project_id).filter_by(course_id=course_id).all()]
            for pid in pids:
                trigger_graph_extract(int(pid))
    except Exception:
        pass
    return {"id": lesson.id, "title": lesson.title}


@router.patch("/courses/{course_id}")
def patch_course(course_id: CourseId, body: CoursePatch, session: Db):
    """Manually edit a course's title or description."""
    if body.title is None and body.description is None:
        raise HTTPException(422, "Nothing to update.")
    course = session.get(models.Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if body.title is not None:
        course.title = body.title.strip()
    if body.description is not None:
        course.description = body.description
    session.commit()
    return {"id": course.id, "title": course.title}
