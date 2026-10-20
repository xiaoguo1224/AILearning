"""The rules a knowledge entry obeys, kept out of the router so they can be tested alone.

Three rules carry the feature, and each of them is a rule about what a STATUS means:

1. A core entry starts in `pending_review`, never in `confirmed`. A model may write a
   definition; it may not declare one settled.
2. Editing a confirmed entry sends it back to `pending_review`. This is the "do not
   silently overwrite a confirmed draft" rule, and it has to live here rather than in a
   UI, because the next writer will not be a UI.
3. Confirming is a separate, explicit act that stamps when it happened. Nothing else sets
   `confirmed_at`.

Each of those is also a moment worth keeping, so every one of them writes a revision
(`app/knowledge/history.py`). The rules stay here because they are rules about status, and
the history module stays ignorant of them: it records whatever the entry says at the
moment it is called.

There is deliberately no "trusted writer" that skips rule 1. An importer that wants to
seed confirmed entries has to confirm them, one at a time, which is the same amount of
work as being sure.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.concepts import normalize_concept
from app.knowledge import history
from app.knowledge.models import (
    CORE_KINDS,
    KIND_NOTE,
    KNOWLEDGE_KINDS,
    KNOWLEDGE_SOURCES,
    REASON_CONFIRMED,
    REASON_CREATED,
    REASON_EDITED,
    RELATION_PREREQUISITE,
    SOURCE_MANUAL,
    STATUS_CONFIRMED,
    STATUS_DRAFT,
    STATUS_PENDING_REVIEW,
    KnowledgeEntry,
    KnowledgeRelation,
    ProjectKnowledge,
)
from app.models import utcnow
from app.projects.service import get_project, project_error, writable_project

MAX_TITLE_CHARS = 200
MAX_BODY_CHARS = 40_000
MAX_PROVENANCE_ITEMS = 20

# The keys a provenance item may carry. Anything else is dropped rather than stored: this
# is a snapshot shown to a learner, not a general-purpose bag, and an unbounded one would
# eventually hold something nobody meant to publish.
_PROVENANCE_KEYS = (
    "kind",
    "resource_id",
    "chunk_id",
    "filename",
    "locator",
    "session_id",
    "message_id",
    "submission_id",
    "question",
)


def initial_status(kind: str) -> str:
    """Where an entry of this kind starts. Core kinds wait for a person."""
    return STATUS_PENDING_REVIEW if kind in CORE_KINDS else STATUS_DRAFT


def normalize_kind(kind: str | None) -> str:
    if kind is None:
        return KIND_NOTE
    if kind not in KNOWLEDGE_KINDS:
        raise project_error(422, "invalid_kind", "Unknown knowledge kind.")
    return kind


def normalize_source(source: str | None) -> str:
    if source is None:
        return SOURCE_MANUAL
    if source not in KNOWLEDGE_SOURCES:
        raise project_error(422, "invalid_source", "Unknown knowledge source.")
    return source


def normalize_provenance(items: list[dict] | None) -> list[dict]:
    """Keep the fields a reader can act on, drop everything else, and cap the list.

    Values are coerced rather than validated strictly: this snapshot is written by the
    server from its own rows, so a stray int where a string was expected is a bug worth
    flattening, not a reason to refuse to save the entry the learner just wrote.
    """
    if not items:
        return []
    cleaned: list[dict] = []
    for item in items[:MAX_PROVENANCE_ITEMS]:
        if not isinstance(item, dict):
            continue
        entry = {key: item[key] for key in _PROVENANCE_KEYS if key in item and item[key] is not None}
        if entry:
            cleaned.append(entry)
    return cleaned


def create_entry(
    session: Session,
    *,
    project_id: int | None,
    title: str,
    body: str,
    kind: str | None = None,
    concept_key: str | None = None,
    source_kind: str | None = None,
    provenance: list[dict] | None = None,
    link_project: bool = True,
) -> KnowledgeEntry:
    """Create one entry, optionally owned by and linked to a project.

    The write lock is taken before anything is inserted, so a project archived between
    the read and the write cannot end up owning a new entry.
    """
    resolved_kind = normalize_kind(kind)
    cleaned_title = (title or "").strip()
    cleaned_body = (body or "").strip()
    if not cleaned_title:
        raise project_error(422, "empty_title", "A knowledge entry needs a title.")
    if not cleaned_body:
        raise project_error(422, "empty_body", "A knowledge entry needs a body.")
    if len(cleaned_title) > MAX_TITLE_CHARS:
        raise project_error(422, "title_too_long", "That title is too long.")
    if len(cleaned_body) > MAX_BODY_CHARS:
        raise project_error(422, "body_too_long", "That entry is too long to store.")

    if project_id is not None:
        writable_project(session, project_id)

    entry = KnowledgeEntry(
        project_id=project_id,
        title=cleaned_title,
        body=cleaned_body,
        kind=resolved_kind,
        status=initial_status(resolved_kind),
        concept_key=normalize_concept(concept_key),
        source_kind=normalize_source(source_kind),
        provenance=normalize_provenance(provenance),
    )
    session.add(entry)
    session.flush()
    history.record(session, entry, reason=REASON_CREATED)
    if project_id is not None and link_project:
        session.add(ProjectKnowledge(project_id=project_id, knowledge_id=entry.id))
    session.commit()
    session.refresh(entry)
    return entry


def entry_or_404(session: Session, knowledge_id: int) -> KnowledgeEntry:
    entry = session.get(KnowledgeEntry, knowledge_id)
    if entry is None:
        raise project_error(404, "knowledge_not_found", "Knowledge entry not found.")
    return entry


def editable_entry(session: Session, knowledge_id: int) -> KnowledgeEntry:
    """Fetch an entry for writing, refusing when its owner is archived.

    A global entry (no owner) has no archive state to consult, so it is editable: the
    alternative would be inventing a project to check, which is exactly the kind of
    invented authority this app avoids elsewhere.
    """
    entry = entry_or_404(session, knowledge_id)
    if entry.project_id is not None:
        writable_project(session, entry.project_id)
        session.refresh(entry)
    return entry


def apply_edit(
    session: Session,
    entry: KnowledgeEntry,
    *,
    title: str | None = None,
    body: str | None = None,
    kind: str | None = None,
    concept_key: str | None = None,
    now: datetime | None = None,
) -> bool:
    """Apply a partial edit. Returns True when a confirmed entry was sent back for review.

    The return value exists so the caller can say so in the response rather than leaving
    the learner to notice that the badge changed.
    """
    changed = False
    if title is not None:
        cleaned = title.strip()
        if not cleaned:
            raise project_error(422, "empty_title", "A knowledge entry needs a title.")
        if len(cleaned) > MAX_TITLE_CHARS:
            raise project_error(422, "title_too_long", "That title is too long.")
        changed = changed or cleaned != entry.title
        entry.title = cleaned
    if body is not None:
        cleaned = body.strip()
        if not cleaned:
            raise project_error(422, "empty_body", "A knowledge entry needs a body.")
        if len(cleaned) > MAX_BODY_CHARS:
            raise project_error(422, "body_too_long", "That entry is too long to store.")
        changed = changed or cleaned != entry.body
        entry.body = cleaned
    if kind is not None:
        resolved = normalize_kind(kind)
        changed = changed or resolved != entry.kind
        entry.kind = resolved
    if concept_key is not None:
        resolved_key = normalize_concept(concept_key)
        changed = changed or resolved_key != entry.concept_key
        entry.concept_key = resolved_key

    reverted = False
    if changed:
        entry.updated_at = now or utcnow()
        if entry.status == STATUS_CONFIRMED:
            entry.status = STATUS_PENDING_REVIEW
            entry.confirmed_at = None
            reverted = True
        elif entry.kind in CORE_KINDS and entry.status == STATUS_DRAFT:
            # Promoting a note to a definition is a change of kind, and the new kind
            # carries the review requirement with it.
            entry.status = STATUS_PENDING_REVIEW
        history.record(session, entry, reason=REASON_EDITED, now=entry.updated_at)
    return reverted


def confirm_entry(
    session: Session, entry: KnowledgeEntry, now: datetime | None = None
) -> KnowledgeEntry:
    """Mark an entry confirmed. Idempotent, and it keeps the first confirmation time.

    A revision is recorded even though the text did not change. The version a person
    approved is the one a later edit is compared against, and finding it by looking for
    the newest revision that happens to be confirmed would fail the moment somebody
    confirms the same text twice for two different reasons.
    """
    if entry.status == STATUS_CONFIRMED:
        return entry
    entry.status = STATUS_CONFIRMED
    entry.confirmed_at = now or utcnow()
    entry.updated_at = entry.confirmed_at
    history.record(session, entry, reason=REASON_CONFIRMED, now=entry.confirmed_at)
    return entry


def link_project(session: Session, project_id: int, knowledge_id: int) -> ProjectKnowledge:
    """Point another project at an entry. Idempotent, and it does not move ownership."""
    get_project(session, project_id)
    existing = (
        session.query(ProjectKnowledge)
        .filter_by(project_id=project_id, knowledge_id=knowledge_id)
        .one_or_none()
    )
    if existing is not None:
        return existing
    writable_project(session, project_id)
    link = ProjectKnowledge(project_id=project_id, knowledge_id=knowledge_id)
    session.add(link)
    session.commit()
    session.refresh(link)
    return link


def _prerequisite_reaches(session: Session, start_id: int, target_id: int) -> bool:
    """Whether `target_id` is already a prerequisite of `start_id`, transitively."""
    seen: set[int] = set()
    frontier = [start_id]
    while frontier:
        current = frontier.pop()
        if current == target_id:
            return True
        if current in seen:
            continue
        seen.add(current)
        rows = (
            session.query(KnowledgeRelation.to_id)
            .filter(
                KnowledgeRelation.from_id == current,
                KnowledgeRelation.kind == RELATION_PREREQUISITE,
            )
            .all()
        )
        frontier.extend(row[0] for row in rows if row[0] not in seen)
    return False


def add_relation(
    session: Session, *, from_id: int, to_id: int, kind: str
) -> KnowledgeRelation:
    """Add a directed edge, refusing the shapes that make the graph unreadable.

    Only `prerequisite` is checked for cycles. `related` and `extends` are allowed to be
    mutual because a symmetric pair there is a statement, not a contradiction.
    """
    if from_id == to_id:
        raise project_error(422, "self_relation", "An entry cannot relate to itself.")
    if kind not in ("prerequisite", "related", "extends"):
        raise project_error(422, "invalid_relation", "Unknown relation kind.")
    source = entry_or_404(session, from_id)
    target = entry_or_404(session, to_id)
    for entry in (source, target):
        if entry.project_id is not None:
            writable_project(session, entry.project_id)

    existing = session.get(KnowledgeRelation, (from_id, to_id))
    if existing is not None:
        if existing.kind == kind:
            return existing
        raise project_error(
            409, "relation_exists", "These entries are already linked by another relation."
        )

    if kind == RELATION_PREREQUISITE and _prerequisite_reaches(session, to_id, from_id):
        raise project_error(
            409,
            "prerequisite_cycle",
            "That would make these two entries prerequisites of each other.",
        )

    relation = KnowledgeRelation(from_id=from_id, to_id=to_id, kind=kind)
    session.add(relation)
    session.commit()
    session.refresh(relation)
    return relation
