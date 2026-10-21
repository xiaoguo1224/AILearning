import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.knowledge import draft as knowledge_draft
from app.knowledge import history, service
from app.knowledge.models import (
    CORE_KINDS,
    RELATION_PREREQUISITE,
    STATUS_CONFIRMED,
    STATUS_DRAFT,
    STATUS_PENDING_REVIEW,
    KnowledgeEntry,
    KnowledgeRelation,
    ProjectKnowledge,
)
from app.knowledge.schemas import (
    CandidateOut,
    CompareResult,
    ConfirmKnowledgeInput,
    CreateKnowledgeInput,
    DiffLine,
    DraftFromMessageInput,
    DraftResult,
    KnowledgeDetail,
    KnowledgeList,
    KnowledgeSummary,
    ProjectRefOut,
    RelationInput,
    RelationOut,
    RevisionDetail,
    RevisionList,
    RevisionSummary,
    UpdateKnowledgeInput,
)
from app.projects.models import Project
from app.projects.service import get_project, local_mutation, project_error, project_session

logger = logging.getLogger("studyforge.knowledge")

router = APIRouter(prefix="/api", tags=["knowledge"])
Db = Annotated[Session, Depends(project_session)]
MUTATION = [Depends(local_mutation)]

MAX_SQLITE_INTEGER = 2_147_483_647


class LinkProjectInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: int


def _relations(session: Session, entry_id: int) -> tuple[list[RelationOut], list[RelationOut]]:
    """(what this entry needs first, what it is otherwise connected to)."""
    incoming = (
        session.query(KnowledgeRelation)
        .filter(
            KnowledgeRelation.to_id == entry_id,
            KnowledgeRelation.kind == RELATION_PREREQUISITE,
        )
        .all()
    )
    touching = (
        session.query(KnowledgeRelation)
        .filter(
            (KnowledgeRelation.from_id == entry_id) | (KnowledgeRelation.to_id == entry_id),
            KnowledgeRelation.kind != RELATION_PREREQUISITE,
        )
        .all()
    )
    return (
        [RelationOut.model_validate(row) for row in incoming],
        [RelationOut.model_validate(row) for row in touching],
    )


def _projects(session: Session, entry: KnowledgeEntry) -> list[ProjectRefOut]:
    """Every project that points at this entry, owner included, in a stable order."""
    rows = (
        session.query(Project.id, Project.name)
        .join(ProjectKnowledge, ProjectKnowledge.project_id == Project.id)
        .filter(ProjectKnowledge.knowledge_id == entry.id)
        .order_by(Project.id)
        .all()
    )
    return [ProjectRefOut(project_id=row[0], name=row[1]) for row in rows]


def _detail(
    session: Session, entry: KnowledgeEntry, *, sent_back: bool = False
) -> KnowledgeDetail:
    prerequisites, related = _relations(session, entry.id)
    return KnowledgeDetail(
        **KnowledgeSummary.model_validate(entry).model_dump(),
        body=entry.body,
        provenance=entry.provenance or [],
        projects=_projects(session, entry),
        prerequisites=prerequisites,
        related=related,
        sent_back_for_review=sent_back,
    )


@router.get("/projects/{project_id}/knowledge", response_model=KnowledgeList)
def list_project_knowledge(
    project_id: int,
    session: Db,
    status: str | None = Query(default=None),
    kind: str | None = Query(default=None),
    core: bool = Query(default=False),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=MAX_SQLITE_INTEGER),
):
    get_project(session, project_id)
    if status is not None and status not in (STATUS_DRAFT, STATUS_PENDING_REVIEW, STATUS_CONFIRMED):
        raise project_error(422, "invalid_status", "Unknown knowledge status.")
    query = (
        session.query(KnowledgeEntry)
        .join(ProjectKnowledge, ProjectKnowledge.knowledge_id == KnowledgeEntry.id)
        .filter(ProjectKnowledge.project_id == project_id)
    )
    if status is not None:
        query = query.filter(KnowledgeEntry.status == status)
    if kind is not None:
        query = query.filter(KnowledgeEntry.kind == kind)
    # `core` is the review queue: the kinds that must be confirmed before they are
    # presented as settled. Filtering here rather than in the client keeps "what needs
    # reviewing" a rule the server states once.
    if core:
        query = query.filter(KnowledgeEntry.kind.in_(CORE_KINDS))
    total = query.count()
    rows = (
        query.order_by(KnowledgeEntry.updated_at.desc(), KnowledgeEntry.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return KnowledgeList(items=[KnowledgeSummary.model_validate(row) for row in rows], total=total)


@router.post(
    "/projects/{project_id}/knowledge",
    response_model=KnowledgeDetail,
    status_code=201,
    dependencies=MUTATION,
)
def create_project_knowledge(project_id: int, body: CreateKnowledgeInput, session: Db):
    entry = service.create_entry(
        session,
        project_id=project_id,
        title=body.title,
        body=body.body,
        kind=body.kind,
        concept_key=body.concept_key,
        source_kind=body.source_kind,
        provenance=[item.model_dump(exclude_none=True) for item in body.provenance],
    )
    logger.info(
        "knowledge_created project_id=%s knowledge_id=%s kind=%s status=%s",
        project_id,
        entry.id,
        entry.kind,
        entry.status,
    )
    return _detail(session, entry)


@router.get("/knowledge/{knowledge_id}", response_model=KnowledgeDetail)
def read_knowledge(knowledge_id: int, session: Db):
    entry = service.entry_or_404(session, knowledge_id)
    return _detail(session, entry)


@router.patch(
    "/knowledge/{knowledge_id}", response_model=KnowledgeDetail, dependencies=MUTATION
)
def update_knowledge(knowledge_id: int, body: UpdateKnowledgeInput, session: Db):
    entry = service.editable_entry(session, knowledge_id)
    service.check_revision(entry, body.expected_updated_at)
    sent_back = service.apply_edit(
        session,
        entry,
        title=body.title,
        body=body.body,
        kind=body.kind,
        concept_key=body.concept_key,
    )
    session.commit()
    session.refresh(entry)
    logger.info(
        "knowledge_updated knowledge_id=%s status=%s sent_back=%s",
        knowledge_id,
        entry.status,
        sent_back,
    )
    return _detail(session, entry, sent_back=sent_back)


@router.post(
    "/knowledge/{knowledge_id}/confirm",
    response_model=KnowledgeDetail,
    dependencies=MUTATION,
)
def confirm_knowledge(knowledge_id: int, session: Db, body: ConfirmKnowledgeInput | None = None):
    entry = service.editable_entry(session, knowledge_id)
    service.check_revision(entry, body.expected_updated_at if body else None)
    service.confirm_entry(session, entry)
    session.commit()
    session.refresh(entry)
    logger.info("knowledge_confirmed knowledge_id=%s", knowledge_id)
    return _detail(session, entry)


@router.get("/knowledge/{knowledge_id}/revisions", response_model=RevisionList)
def list_knowledge_revisions(knowledge_id: int, session: Db):
    """Every snapshot of this entry, oldest first.

    Readable for an archived project on purpose: the history is what makes a past
    decision checkable, and freezing writes must not also freeze the record of them.
    """
    entry = service.entry_or_404(session, knowledge_id)
    rows = history.revisions(session, entry.id)
    confirmed = history.latest_confirmed(rows)
    return RevisionList(
        items=[RevisionSummary.model_validate(row) for row in rows],
        total=len(rows),
        confirmed_version=confirmed.version if confirmed is not None else None,
        current_version=rows[-1].version if rows else 0,
    )


@router.get("/knowledge/{knowledge_id}/revisions/{version}", response_model=RevisionDetail)
def read_knowledge_revision(knowledge_id: int, version: int, session: Db):
    service.entry_or_404(session, knowledge_id)
    for row in history.revisions(session, knowledge_id):
        if row.version == version:
            return RevisionDetail.model_validate(row)
    raise project_error(404, "revision_not_found", "That version does not exist.")


@router.get("/knowledge/{knowledge_id}/compare", response_model=CompareResult)
def compare_knowledge_revision(
    knowledge_id: int,
    session: Db,
    from_version: int | None = Query(default=None, ge=1),
):
    """One version against the entry as it stands now.

    With no version named, the comparison opens on the last version a person confirmed —
    the question the review step exists to answer. Falling back to the newest revision
    when nothing was ever confirmed keeps the endpoint useful for an entry that is still
    a draft, rather than refusing to show anything until it has a decision attached.
    """
    entry = service.entry_or_404(session, knowledge_id)
    rows = history.revisions(session, entry.id)
    if not rows:
        raise project_error(
            404,
            "no_revision",
            "This entry has no recorded versions, so there is nothing to compare against.",
        )
    if from_version is None:
        start = history.latest_confirmed(rows) or rows[-1]
    else:
        start = next((row for row in rows if row.version == from_version), None)
        if start is None:
            raise project_error(404, "revision_not_found", "That version does not exist.")

    lines, truncated = history.diff_lines(start.body, entry.body)
    changed = (
        start.title != entry.title
        or start.kind != entry.kind
        or start.concept_key != (entry.concept_key or "")
        or any(line["op"] in ("delete", "insert") for line in lines)
    )
    return CompareResult(
        from_version=start.version,
        from_title=start.title,
        from_kind=start.kind,
        from_status=start.status,
        to_title=entry.title,
        to_kind=entry.kind,
        to_status=entry.status,
        changed=changed,
        truncated=truncated,
        lines=[DiffLine(**line) for line in lines],
    )


@router.post(
    "/knowledge/{knowledge_id}/relations",
    response_model=RelationOut,
    status_code=201,
    dependencies=MUTATION,
)
def create_relation(knowledge_id: int, body: RelationInput, session: Db):
    relation = service.add_relation(
        session, from_id=knowledge_id, to_id=body.to_id, kind=body.kind
    )
    logger.info(
        "knowledge_relation_created from_id=%s to_id=%s kind=%s",
        relation.from_id,
        relation.to_id,
        relation.kind,
    )
    return RelationOut.model_validate(relation)


@router.post(
    "/knowledge/{knowledge_id}/projects",
    response_model=list[ProjectRefOut],
    status_code=201,
    dependencies=MUTATION,
)
def link_knowledge_project(knowledge_id: int, body: LinkProjectInput, session: Db):
    """Point another project at an entry. Ownership does not move."""
    service.entry_or_404(session, knowledge_id)
    service.link_project(session, body.project_id, knowledge_id)
    entry = service.entry_or_404(session, knowledge_id)
    return _projects(session, entry)


@router.post(
    "/projects/{project_id}/knowledge/drafts",
    response_model=DraftResult,
    status_code=201,
    dependencies=MUTATION,
)
def draft_from_answer(project_id: int, body: DraftFromMessageInput, session: Db):
    """Keep one grounded answer as a draft note.

    Deliberately not a model call: the answer already exists, already cites the material,
    and already cost what it cost. A repeat of a title returns the existing entry instead
    of a second copy, and a confirmed entry is reported as a candidate rather than being
    rewritten — a draft from today's answer is not evidence about something a person
    already settled.
    """
    entry, duplicate_of, found = knowledge_draft.draft_from_message(
        session, project_id, session_id=body.session_id, message_id=body.message_id
    )
    if entry is None:
        logger.info(
            "knowledge_draft_duplicate project_id=%s duplicate_of=%s", project_id, duplicate_of
        )
        return DraftResult(
            duplicate_of=duplicate_of,
            candidates=[CandidateOut(**item) for item in found],
        )
    logger.info(
        "knowledge_draft_created project_id=%s knowledge_id=%s candidates=%s",
        project_id,
        entry.id,
        len(found),
    )
    return DraftResult(
        entry=_detail(session, entry),
        candidates=[CandidateOut(**item) for item in found],
    )
