import logging
import os
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy import update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, joinedload

from app.db import get_session
from app.locale import localize_error
from app.models import utcnow
from app.projects.models import Project, ProjectCourse
from app.projects.schemas import LinkedCourse, ProjectDetail, ProjectOut

logger = logging.getLogger("studyforge.projects")


def project_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status, detail={"error": code, "message": localize_error(code, message)}
    )


def project_session(session: Session = Depends(get_session)):
    try:
        yield session
    except OperationalError:
        session.rollback()
        logger.warning("project_operation_failed reason=database_unavailable")
        raise project_error(
            503, "database_unavailable", "The database is busy. Please retry."
        ) from None


def local_mutation(request: Request) -> None:
    origin = request.headers.get("origin")
    allowed = {
        value.strip()
        for value in os.getenv("STUDYFORGE_CORS_ORIGINS", "http://localhost:3000").split(",")
    }
    if origin is not None and origin not in allowed:
        raise project_error(
            403, "origin_not_allowed", "This origin is not allowed to change projects."
        )


def get_project(session: Session, project_id: int) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise project_error(404, "project_not_found", "Project not found.")
    return project


def writable_project(
    session: Session, project_id: int, expected_updated_at: datetime | None = None
) -> Project:
    # Conditional UPDATE acquires SQLite's write lock before membership changes or archive checks.
    statement = update(Project).where(Project.id == project_id, Project.status == "active")
    if expected_updated_at is not None:
        statement = statement.where(
            Project.updated_at == expected_updated_at.astimezone(UTC).replace(tzinfo=None)
        )
    changed = session.execute(
        statement.values(updated_at=utcnow()).returning(Project.id)
    ).scalar_one_or_none()
    if changed is None:
        project = get_project(session, project_id)
        if project.status == "archived":
            raise project_error(409, "project_archived", "Archived projects are read-only.")
        raise project_error(
            409, "project_changed", "This project changed. Reload saved values before saving again."
        )
    return get_project(session, project_id)


def project_detail(session: Session, project: Project) -> ProjectDetail:
    links = (
        session.query(ProjectCourse)
        .filter_by(project_id=project.id)
        .options(joinedload(ProjectCourse.course, innerjoin=True))
        .order_by(ProjectCourse.position, ProjectCourse.course_id)
        .all()
    )
    return ProjectDetail(
        **ProjectOut.model_validate(project).model_dump(),
        courses=[
            LinkedCourse(
                course_id=link.course_id,
                title=link.course.title,
                description=link.course.description,
                position=link.position,
            )
            for link in links
        ],
    )
