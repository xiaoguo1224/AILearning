import logging

from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.knowledge import errors
from app.knowledge.models import ErrorCause
from app.models import utcnow
from app.projects.service import get_project, project_error, writable_project
from app.suggestions.models import LearningSuggestion
from app.suggestions.schemas import DecisionInput, SuggestionInput, SuggestionList, SuggestionOut

logger = logging.getLogger("studyforge.suggestions")

def create_suggestion(project_id: int, body: SuggestionInput, session: Session):
    writable_project(session, project_id)
    target = get_project(session, body.target_project_id)  # Read only until explicit acceptance.
    if target.id == project_id:
        raise project_error(422, "same_project", "Choose a different project for this suggestion.")
    if target.status != "active":
        raise project_error(409, "project_archived", "Archived projects are read-only.")
    source = session.get(ErrorCause, body.source_error_id)
    if source is None or source.project_id != project_id:
        raise project_error(404, "error_not_found", "Diagnosis not found in this project.")
    existing = session.query(LearningSuggestion).filter_by(
        source_error_id=source.id, target_project_id=target.id).one_or_none()
    if existing:
        session.commit()
        return suggestion_out(session, existing)
    if not errors.is_open(session, source):
        raise project_error(409, "diagnosis_closed", "This diagnosis no longer needs review.")
    row = LearningSuggestion(
        source_project_id=project_id, target_project_id=target.id, source_error_id=source.id,
        concept_key=source.concept_key, concept_label=source.concept_label,
        cause=source.cause, evidence=f"{source.note}\n{source.detail}"[:4000],
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    logger.info("suggestion_created suggestion_id=%s source_project_id=%s target_project_id=%s", row.id, project_id, target.id)
    return suggestion_out(session, row)


def list_suggestions(project_id: int, session: Session, offset: int = 0):
    get_project(session, project_id)
    query = session.query(LearningSuggestion).filter(or_(
        LearningSuggestion.source_project_id == project_id,
        LearningSuggestion.target_project_id == project_id,
    ))
    return SuggestionList(total=query.count(), items=[suggestion_out(session, row) for row in
        query.order_by(LearningSuggestion.created_at.desc(), LearningSuggestion.id.desc()).offset(offset).limit(50)])


def decide_suggestion(suggestion_id: int, body: DecisionInput, session: Session):
    # Acquire the SQLite writer before reading state; retries cannot create two tasks.
    session.execute(update(LearningSuggestion).where(LearningSuggestion.id == suggestion_id)
                    .values(state=LearningSuggestion.state))
    row = session.get(LearningSuggestion, suggestion_id)
    if row is None:
        raise project_error(404, "suggestion_not_found", "Suggestion not found.")
    session.refresh(row)
    if row.state != "pending":
        if row.state != body.decision:
            raise project_error(409, "suggestion_decided", "This suggestion has already been decided.")
        return suggestion_out(session, row)
    if body.decision == "accepted":
        writable_project(session, row.source_project_id)
        source = session.get(ErrorCause, row.source_error_id)
        if source is None or not errors.is_open(session, source):
            raise project_error(409, "diagnosis_closed", "This diagnosis no longer needs review.")
        created = errors.record(session, row.target_project_id, concept_key=row.concept_key,
            concept_label=row.concept_label, cause=row.cause,
            note=f"Accepted cross-project review suggestion #{row.id} from project #{row.source_project_id}.",
            detail=row.evidence, commit=False)
        row.target_error_id = created.id
    row.state = body.decision
    row.decided_at = utcnow()
    session.commit()
    session.refresh(row)
    logger.info("suggestion_decided suggestion_id=%s decision=%s target_error_id=%s", row.id, row.state, row.target_error_id)
    return suggestion_out(session, row)


def suggestion_out(session: Session, row: LearningSuggestion) -> SuggestionOut:
    return SuggestionOut.model_validate(row).model_copy(update={
        "source_name": get_project(session, row.source_project_id).name,
        "target_name": get_project(session, row.target_project_id).name,
    })
