from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.projects.service import local_mutation, project_session
from app.suggestions import service
from app.suggestions.schemas import DecisionInput, SuggestionInput, SuggestionList, SuggestionOut

router = APIRouter(prefix="/api", tags=["suggestions"])
Db = Annotated[Session, Depends(project_session)]
EntityId = Annotated[int, Path(gt=0, le=2**63 - 1)]
MUTATION = [Depends(local_mutation)]

@router.post("/projects/{project_id}/suggestions", response_model=SuggestionOut, status_code=201, dependencies=MUTATION)
def create_suggestion(project_id: EntityId, body: SuggestionInput, session: Db):
    return service.create_suggestion(project_id, body, session)

@router.get("/projects/{project_id}/suggestions", response_model=SuggestionList)
def list_suggestions(project_id: EntityId, session: Db, offset: int = Query(0, ge=0, le=2**63-1)):
    return service.list_suggestions(project_id, session, offset)

@router.post("/suggestions/{suggestion_id}/decision", response_model=SuggestionOut, dependencies=MUTATION)
def decide_suggestion(suggestion_id: EntityId, body: DecisionInput, session: Db):
    return service.decide_suggestion(suggestion_id, body, session)
