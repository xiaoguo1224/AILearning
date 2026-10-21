from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.curriculum.schemas import ProjectCurriculum
from app.curriculum.service import project_curriculum
from app.projects.service import project_session

router = APIRouter(prefix="/api", tags=["curriculum"])


@router.get("/projects/{project_id}/curriculum", response_model=ProjectCurriculum)
def curriculum(
    project_id: Annotated[int, Path(gt=0, le=2**63 - 1)],
    session: Annotated[Session, Depends(project_session)],
):
    return project_curriculum(session, project_id)
