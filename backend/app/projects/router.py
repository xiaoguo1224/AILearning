import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.models import Course, utcnow
from app.projects.models import Project, ProjectCourse
from app.projects.schemas import (
    CourseLinkInput,
    ProjectCreate,
    ProjectDetail,
    ProjectList,
    ProjectPatch,
    ProjectStatus,
)
from app.projects.service import (
    get_project,
    local_mutation,
    project_detail,
    project_error,
    project_session,
    writable_project,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])
logger = logging.getLogger("studyforge.projects")
MAX_SQLITE_INTEGER = 2**63 - 1
EntityId = Annotated[int, Path(gt=0, le=MAX_SQLITE_INTEGER)]
Db = Annotated[Session, Depends(project_session)]
MUTATION = [Depends(local_mutation)]


@router.get("", response_model=ProjectList)
def list_projects(
    session: Db,
    status: ProjectStatus = "active",
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=MAX_SQLITE_INTEGER),
):
    query = session.query(Project).filter(Project.status == status)
    return {
        "items": query.order_by(Project.updated_at.desc(), Project.id.desc())
        .offset(offset)
        .limit(limit)
        .all(),
        "total": query.count(),
    }


@router.post("", response_model=ProjectDetail, status_code=201, dependencies=MUTATION)
def create_project(body: ProjectCreate, session: Db):
    project = Project(**body.model_dump())
    session.add(project)
    session.commit()
    logger.info("project_created project_id=%s", project.id)
    return project_detail(session, project)


@router.get("/{project_id}", response_model=ProjectDetail)
def read_project(project_id: EntityId, session: Db):
    return project_detail(session, get_project(session, project_id))


@router.patch("/{project_id}", response_model=ProjectDetail, dependencies=MUTATION)
def edit_project(project_id: EntityId, body: ProjectPatch, session: Db):
    project = writable_project(session, project_id, body.expected_updated_at)
    for field, value in body.model_dump(
        exclude_unset=True, exclude={"expected_updated_at"}
    ).items():
        setattr(project, field, value)
    session.commit()
    logger.info("project_updated project_id=%s", project_id)
    return project_detail(session, project)


@router.post("/{project_id}/archive", response_model=ProjectDetail, dependencies=MUTATION)
def archive_project(project_id: EntityId, session: Db):
    changed = session.execute(
        update(Project)
        .where(Project.id == project_id, Project.status == "active")
        .values(status="archived", updated_at=utcnow())
        .returning(Project.id)
    ).scalar_one_or_none()
    if changed is None:
        get_project(session, project_id)
    session.commit()
    logger.info("project_archived project_id=%s", project_id)
    return project_detail(session, get_project(session, project_id))


@router.put(
    "/{project_id}/courses/{course_id}", response_model=ProjectDetail, dependencies=MUTATION
)
def link_course(project_id: EntityId, course_id: EntityId, body: CourseLinkInput, session: Db):
    project = writable_project(session, project_id)
    if session.get(Course, course_id) is None:
        raise project_error(404, "course_not_found", "Course not found.")
    session.execute(
        insert(ProjectCourse)
        .values(project_id=project_id, course_id=course_id, position=body.position)
        .on_conflict_do_update(
            index_elements=["project_id", "course_id"], set_={"position": body.position}
        )
    )
    session.commit()
    logger.info("project_course_linked project_id=%s course_id=%s", project_id, course_id)
    return project_detail(session, project)


@router.delete(
    "/{project_id}/courses/{course_id}", response_model=ProjectDetail, dependencies=MUTATION
)
def unlink_course(project_id: EntityId, course_id: EntityId, session: Db):
    project = writable_project(session, project_id)
    session.query(ProjectCourse).filter_by(project_id=project_id, course_id=course_id).delete()
    session.commit()
    logger.info("project_course_unlinked project_id=%s course_id=%s", project_id, course_id)
    return project_detail(session, project)
