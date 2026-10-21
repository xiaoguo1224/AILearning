from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.content_reviews import service
from app.content_reviews.models import ContentReview
from app.content_reviews.schemas import ContentReviewInput, ContentReviewList, ContentReviewOut
from app.projects.service import get_project, local_mutation, project_session

router = APIRouter(prefix="/api", tags=["content-reviews"])
Db = Annotated[Session, Depends(project_session)]
EntityId = Annotated[int, Path(gt=0, le=2**63 - 1)]


@router.post(
    "/projects/{project_id}/content-reviews",
    response_model=ContentReviewOut,
    status_code=201,
    dependencies=[Depends(local_mutation)],
)
def create_review(project_id: EntityId, body: ContentReviewInput, session: Db):
    return service.create(session, project_id, body)


@router.get("/projects/{project_id}/content-reviews", response_model=ContentReviewList)
def list_reviews(project_id: EntityId, session: Db, offset: int = Query(0, ge=0, le=2**63 - 1)):
    get_project(session, project_id)
    query = session.query(ContentReview).filter_by(project_id=project_id)
    return {
        "total": query.count(),
        "items": [
            service.describe(session, row)
            for row in query.order_by(ContentReview.id.desc()).offset(offset).limit(50)
        ],
    }
