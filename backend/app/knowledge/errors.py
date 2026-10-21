"""Mistakes, the knowledge point each belongs to, and the queue that follows from them.

THE FIREWALL, STATED ONCE. Nothing in this module writes `review_cards`. Not on record,
not on dismiss, not on read. The scheduler is written by `review.record_review` and by
nothing else, and that is not a layering preference: FSRS fits the next interval against
`elapsed_days`, so a due date moved by anything other than a real retrieval would be
fitted against a memory event that never happened. A chat message that says "you seem
weak on matrix shapes" is a hypothesis. Only the learner answering something is evidence.

WHAT A "REVIEW TASK" IS THEREFORE. Not a scheduled item and not a date. It is a concept
with at least one open diagnosis, where "open" means: not dismissed by a person, and no
review log for that concept exists after the newest diagnosis. Closure is derived on
every read rather than stored, because a derived fact written down becomes a second
source of truth that can disagree with the logs it was derived from.

WHY THE MAPPING IS OFTEN MISSING. A diagnosis can name a concept the project has never
written a knowledge entry for. That is recorded with `knowledge_id = NULL` rather than
refused, and it is the most useful state the table has: a mistake with nowhere to live is
the clearest possible statement that a note is missing.
"""

import logging
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.concepts import normalize_concept
from app.knowledge.models import (
    CAUSE_UNCLASSIFIED,
    ERROR_CAUSES,
    ERROR_SOURCE_ATTEMPT,
    ERROR_SOURCE_MANUAL,
    ERROR_SOURCES,
    STATUS_CONFIRMED,
    STATUS_DRAFT,
    STATUS_PENDING_REVIEW,
    ErrorCause,
    KnowledgeEntry,
    ProjectKnowledge,
)
from app.models import Attempt, Lesson, Module, ReviewCard, ReviewLog, utcnow
from app.projects.models import ProjectCourse
from app.projects.service import project_error, writable_project

logger = logging.getLogger("studyforge.knowledge.errors")

MAX_NOTE_CHARS = 4_000
MAX_DETAIL_CHARS = 4_000
MAX_LABEL_CHARS = 200

# Which status wins when several entries share a concept key. A confirmed definition is
# what the learner should be pointed at; a draft is better than nothing but is labelled
# as such wherever it is shown.
_MAPPING_PRIORITY = {STATUS_CONFIRMED: 0, STATUS_PENDING_REVIEW: 1, STATUS_DRAFT: 2}


def normalize_cause(cause: str | None) -> str:
    if cause is None:
        return CAUSE_UNCLASSIFIED
    if cause not in ERROR_CAUSES:
        raise project_error(422, "invalid_cause", "Unknown error cause.")
    return cause


def normalize_source(source: str | None) -> str:
    if source is None:
        return ERROR_SOURCE_MANUAL
    if source not in ERROR_SOURCES:
        raise project_error(422, "invalid_source", "Unknown error source.")
    return source


def map_knowledge(
    session: Session, project_id: int, concept_key: str
) -> KnowledgeEntry | None:
    """The knowledge entry this concept belongs to, if the project has written one.

    A confirmed entry wins over a pending one, which wins over a draft, because a
    diagnosis is going to be shown next to the entry's title and pointing at a draft when
    a confirmed definition exists would send the learner to the weaker text. Ties break on
    the most recently updated, which is the one somebody just worked on.
    """
    if not concept_key:
        return None
    rows = (
        session.query(KnowledgeEntry)
        .join(ProjectKnowledge, ProjectKnowledge.knowledge_id == KnowledgeEntry.id)
        .filter(
            ProjectKnowledge.project_id == project_id,
            KnowledgeEntry.concept_key == concept_key,
        )
        .all()
    )
    if not rows:
        return None
    rows.sort(key=lambda row: (_MAPPING_PRIORITY.get(row.status, 9), -row.id))
    return rows[0]


def _project_entry(session: Session, project_id: int, knowledge_id: int) -> KnowledgeEntry:
    """An entry this project can actually see, owned by it or merely linked."""
    entry = session.get(KnowledgeEntry, knowledge_id)
    if entry is None:
        raise project_error(404, "knowledge_not_found", "Knowledge entry not found.")
    linked = (
        session.query(ProjectKnowledge)
        .filter_by(project_id=project_id, knowledge_id=knowledge_id)
        .one_or_none()
    )
    if linked is None:
        raise project_error(
            422, "knowledge_not_in_project", "That knowledge entry is not part of this project."
        )
    return entry


def record(
    session: Session,
    project_id: int,
    *,
    concept_key: str | None = None,
    concept_label: str | None = None,
    knowledge_id: int | None = None,
    cause: str | None = None,
    note: str = "",
    source_kind: str | None = None,
    source_id: int | None = None,
    detail: str = "",
    _validated_source: bool = False,
) -> ErrorCause:
    """Record one diagnosis. Writes no review card, by design — see the module docstring."""
    resolved_source = normalize_source(source_kind)
    resolved_cause = normalize_cause(cause)
    if (resolved_source != ERROR_SOURCE_MANUAL and not _validated_source) or (
        resolved_source == ERROR_SOURCE_MANUAL and source_id is not None
    ):
        raise project_error(422, "unverified_source", "Use the evidence-specific endpoint to attach a source.")

    entry: KnowledgeEntry | None = None
    if knowledge_id is not None:
        entry = _project_entry(session, project_id, knowledge_id)

    key = normalize_concept(concept_key) or (entry.concept_key if entry is not None else "")
    if entry is not None and key != entry.concept_key:
        raise project_error(422, "concept_mismatch", "The concept does not match this knowledge entry.")
    if not key:
        raise project_error(
            422,
            "empty_concept",
            "A diagnosis needs a concept, or a knowledge entry that already has one.",
        )
    if entry is None:
        entry = map_knowledge(session, project_id, key)

    writable_project(session, project_id)

    row = ErrorCause(
        project_id=project_id,
        knowledge_id=entry.id if entry is not None else None,
        concept_key=key,
        concept_label=(concept_label or (entry.title if entry is not None else "") or key)[
            :MAX_LABEL_CHARS
        ],
        cause=resolved_cause,
        note=(note or "").strip()[:MAX_NOTE_CHARS],
        source_kind=resolved_source,
        source_id=source_id,
        detail=(detail or "").strip()[:MAX_DETAIL_CHARS],
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    logger.info(
        "error_cause_recorded project_id=%s error_id=%s concept=%s cause=%s mapped=%s",
        project_id,
        row.id,
        row.concept_key,
        row.cause,
        row.knowledge_id,
    )
    return row


def from_attempt(
    session: Session,
    project_id: int,
    *,
    attempt_id: int,
    cause: str | None = None,
    note: str = "",
) -> ErrorCause:
    """Diagnose a wrong quiz answer. The concept comes from the attempt, not the caller.

    The attempt is the evidence, so its concept is the one that gets recorded; letting a
    caller pass a different one would let a diagnosis point at a concept the answer was
    never about. Only a wrong attempt can be diagnosed — "what went wrong" has no meaning
    for an answer that was right.

    The attempt's course must belong to the project, because the diagnosis is filed under
    that project: without the check, a mistake made in one project could be queued as work
    in another, and the wrong project would then be the one showing a review task for a
    concept it never taught.
    """
    attempt = session.get(Attempt, attempt_id)
    if attempt is None:
        raise project_error(404, "attempt_not_found", "That attempt does not exist.")
    course_id = (
        session.query(Module.course_id)
        .join(Lesson, Lesson.module_id == Module.id)
        .filter(Lesson.id == attempt.lesson_id)
        .scalar()
    )
    linked = (
        session.query(ProjectCourse)
        .filter_by(project_id=project_id, course_id=course_id)
        .one_or_none()
        if course_id is not None
        else None
    )
    if linked is None:
        raise project_error(
            422, "attempt_not_in_project", "That attempt belongs to a course outside this project."
        )
    if attempt.correct:
        raise project_error(
            422, "attempt_was_correct", "That answer was right, so there is nothing to diagnose."
        )
    detail = f"submitted: {attempt.submitted_answer}\nexpected: {attempt.expected_answer}"
    return record(
        session,
        project_id,
        concept_key=attempt.concept_key,
        concept_label=attempt.concept_label,
        cause=cause,
        note=note,
        source_kind=ERROR_SOURCE_ATTEMPT,
        source_id=attempt.id,
        detail=detail,
        _validated_source=True,
    )


def dismiss(session: Session, error_id: int, now: datetime | None = None) -> ErrorCause:
    """A person says this diagnosis is not worth acting on. Idempotent."""
    row = session.get(ErrorCause, error_id)
    if row is None:
        raise project_error(404, "error_not_found", "That diagnosis does not exist.")
    writable_project(session, row.project_id)
    if row.dismissed_at is None:
        row.dismissed_at = now or utcnow()
        session.commit()
        session.refresh(row)
        logger.info("error_cause_dismissed error_id=%s", error_id)
    return row


def _latest_review(session: Session, concept_keys: list[str]) -> dict[str, datetime]:
    """When each concept was last actually reviewed, for closure.

    Reads `review_logs` and nothing else. A card's `last_review` would answer the same
    question with one fewer join and would be the wrong source: it is the scheduler's own
    summary, and the log is the record it summarises.
    """
    if not concept_keys:
        return {}
    rows = (
        session.query(ReviewCard.concept_key, ReviewLog.reviewed_at)
        .join(ReviewLog, ReviewLog.card_id == ReviewCard.id)
        .filter(ReviewCard.concept_key.in_(concept_keys))
        .filter(ReviewLog.rating >= 2)
        .order_by(ReviewLog.reviewed_at.desc())
        .all()
    )
    latest: dict[str, datetime] = {}
    for key, moment in rows:
        latest.setdefault(key, moment)
    return latest


def _card_summary(session: Session, concept_keys: list[str]) -> dict[str, ReviewCard]:
    if not concept_keys:
        return {}
    rows = session.query(ReviewCard).filter(ReviewCard.concept_key.in_(concept_keys)).all()
    return {row.concept_key: row for row in rows}


def open_causes(session: Session, project_id: int) -> list[ErrorCause]:
    return (
        session.query(ErrorCause)
        .filter(ErrorCause.project_id == project_id, ErrorCause.dismissed_at.is_(None))
        .order_by(ErrorCause.created_at, ErrorCause.id)
        .all()
    )


def tasks(session: Session, project_id: int, now: datetime | None = None) -> list[dict]:
    """Open diagnoses grouped by concept, newest first.

    Grouping happens here rather than in SQL because the closure rule needs the newest
    diagnosis per concept compared against that concept's newest review, and expressing
    "no review after the newest of these rows" as a window function would buy nothing on
    a table this size while making the rule unreadable.
    """
    rows = open_causes(session, project_id)
    if not rows:
        return []

    grouped: dict[str, list[ErrorCause]] = {}
    for row in rows:
        grouped.setdefault(row.concept_key, []).append(row)

    keys = list(grouped)
    reviews = _latest_review(session, keys)
    cards = _card_summary(session, keys)
    wanted = {row.knowledge_id for row in rows if row.knowledge_id}
    entries = (
        {
            entry.id: entry
            for entry in session.query(KnowledgeEntry).filter(KnowledgeEntry.id.in_(wanted))
        }
        if wanted
        else {}
    )

    moment = now or utcnow()
    result: list[dict] = []
    for key, causes in grouped.items():
        reviewed = reviews.get(key)
        # Each diagnosis closes individually once a review follows it, so a group that was
        # answered and then broken again keeps only the newer mistakes. Counting the
        # answered ones would make a reopened task look worse than the relapse it is.
        active = [row for row in causes if reviewed is None or row.created_at > reviewed]
        if not active:
            continue
        newest = max(active, key=lambda row: (row.created_at, row.id))
        entry = entries.get(newest.knowledge_id) if newest.knowledge_id else None
        counts: dict[str, int] = {}
        for row in active:
            counts[row.cause] = counts.get(row.cause, 0) + 1
        card = cards.get(key)
        result.append(
            {
                "concept_key": key,
                "concept_label": newest.concept_label or key,
                "knowledge_id": entry.id if entry is not None else None,
                "knowledge_title": entry.title if entry is not None else None,
                "knowledge_status": entry.status if entry is not None else None,
                "open_errors": len(active),
                "causes": [
                    {"cause": cause, "count": count}
                    for cause, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
                ],
                "latest_error_id": newest.id,
                "latest_cause": newest.cause,
                "latest_note": newest.note,
                "latest_detail": newest.detail,
                "first_seen": active[0].created_at,
                "last_seen": newest.created_at,
                # Read-only, and deliberately not a due date the UI may sort by: it is
                # here so the screen can say "this card is due" as a fact, not so the app
                # can push the learner at it.
                "card": (
                    {
                        "id": card.id,
                        "state": card.state,
                        "due": card.due,
                        "lapses": card.lapses,
                        "reps": card.reps,
                        "is_due": card.due is not None and card.due <= moment.replace(tzinfo=None),
                    }
                    if card is not None
                    else None
                ),
            }
        )

    result.sort(key=lambda item: (item["last_seen"], item["latest_error_id"]), reverse=True)
    return result


def cause_counts(session: Session, project_id: int) -> dict[str, int]:
    """How often each cause has been recorded, dismissed ones included.

    Dismissed rows are counted on purpose: dismissing a diagnosis says "do not chase this",
    not "this did not happen", and a breakdown that dropped them would quietly under-report
    the pattern it exists to reveal.
    """
    rows = (
        session.query(ErrorCause.cause, func.count(ErrorCause.id))
        .filter(ErrorCause.project_id == project_id)
        .group_by(ErrorCause.cause)
        .all()
    )
    return {cause: count for cause, count in rows}
