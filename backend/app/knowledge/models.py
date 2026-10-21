"""Knowledge: what a project has learned, kept apart from what it was told.

FIVE TABLES, AND THE REASON EACH EXISTS.
`KnowledgeEntry` is the content. It carries a status because the product distinguishes
two very different things wearing the same word "note": an ordinary draft that the model
wrote while answering a question, which is useful immediately, and a core definition or
standard answer, which is the thing a learner will later quote and therefore must be
confirmed by a person before it is presented as settled.

`ProjectKnowledge` is a reference, not ownership. `KnowledgeEntry.project_id` says who
owns the entry and therefore whose archive state governs whether it can be edited; this
table says which other projects point at it. A NULL owner is the global library case the
PRD asks for — a definition that is not about one project — and it is deliberately
editable without an archive check, because there is no project whose archive state could
speak for it.

`KnowledgeRelation` is the graph. `prerequisite` is the only edge with a rule attached:
a cycle would make "what do I need first" unanswerable, so one is refused rather than
stored and quietly ignored.

`KnowledgeRevision` is the history. Confirming a definition is a judgement about specific
words, and the words change afterwards; without a record of what was confirmed, "approved"
would mean "approved at some point" and the difference between the two would be
unrecoverable. Every revision keeps the whole entry rather than the edit that produced it,
because the only question this table answers is "what did this say then" and a patch chain
can answer it wrongly after one bad replay.

`ErrorCause` is the other direction of the same idea: instead of what a project knows, what
it keeps getting wrong, and which knowledge point that belongs to. It is deliberately not
a scheduler — recording a mistake writes no review card, because a schedule is a model of
memory and the only evidence that memory moved is a retrieval the learner performed.

WHY PROVENANCE IS A JSON SNAPSHOT. The same reason the exploration messages keep theirs:
a resource can be deleted, and an entry that claimed to derive from it would then point
at nothing. The snapshot keeps what was shown — filename, locator, the conversation it
came out of — so the claim "this came from somewhere" stays checkable in the only sense
this app can offer.
"""

from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.db import Base
from app.models import utcnow

STATUS_DRAFT = "draft"
STATUS_PENDING_REVIEW = "pending_review"
STATUS_CONFIRMED = "confirmed"
KNOWLEDGE_STATUSES = (STATUS_DRAFT, STATUS_PENDING_REVIEW, STATUS_CONFIRMED)

KIND_NOTE = "note"
KIND_DEFINITION = "definition"
KIND_STANDARD_ANSWER = "standard_answer"
KNOWLEDGE_KINDS = (KIND_NOTE, KIND_DEFINITION, KIND_STANDARD_ANSWER)

# The kinds that must be confirmed before they are presented as settled. A note is
# allowed to be wrong and useful at the same time; a definition is not.
CORE_KINDS = (KIND_DEFINITION, KIND_STANDARD_ANSWER)

SOURCE_MANUAL = "manual"
SOURCE_EXPLORATION = "exploration"
SOURCE_RESOURCE = "resource"
SOURCE_SUBMISSION = "submission"
KNOWLEDGE_SOURCES = (SOURCE_MANUAL, SOURCE_EXPLORATION, SOURCE_RESOURCE, SOURCE_SUBMISSION)

RELATION_PREREQUISITE = "prerequisite"
RELATION_RELATED = "related"
RELATION_EXTENDS = "extends"
KNOWLEDGE_RELATIONS = (RELATION_PREREQUISITE, RELATION_RELATED, RELATION_EXTENDS)

# Why a snapshot was taken. Confirmation is recorded as its own reason even when the text
# did not change, because the version a person signed off is the one later edits are
# compared against, and "which one was that" must not depend on guessing from timestamps.
REASON_CREATED = "created"
REASON_EDITED = "edited"
REASON_CONFIRMED = "confirmed"
REVISION_REASONS = (REASON_CREATED, REASON_EDITED, REASON_CONFIRMED)

# What went wrong, in a vocabulary small enough to count. Free text is kept beside it in
# `note`; the point of the enum is that "this learner mostly loses marks on notation"
# becomes a claim the app can make, and a tag cloud cannot make claims.
CAUSE_CONCEPT_GAP = "concept_gap"
CAUSE_PROCEDURE = "procedure"
CAUSE_NOTATION = "notation"
CAUSE_MISREAD = "misread"
CAUSE_TOOLING = "tooling"
CAUSE_CARELESS = "careless"
CAUSE_UNCLASSIFIED = "unclassified"
ERROR_CAUSES = (
    CAUSE_CONCEPT_GAP,
    CAUSE_PROCEDURE,
    CAUSE_NOTATION,
    CAUSE_MISREAD,
    CAUSE_TOOLING,
    CAUSE_CARELESS,
    CAUSE_UNCLASSIFIED,
)

# Where a diagnosis came from. The id is stored without a foreign key because the rows it
# points at are deletable — attempts die with their course — and a diagnosis that
# vanished with its evidence would take the learner's own note with it.
ERROR_SOURCE_ATTEMPT = "attempt"
ERROR_SOURCE_SUBMISSION = "submission"
ERROR_SOURCE_MANUAL = "manual"
ERROR_SOURCES = (ERROR_SOURCE_ATTEMPT, ERROR_SOURCE_SUBMISSION, ERROR_SOURCE_MANUAL)


class KnowledgeEntry(Base):
    __tablename__ = "knowledge_entries"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'pending_review', 'confirmed')", name="ck_knowledge_status"
        ),
        CheckConstraint(
            "kind IN ('note', 'definition', 'standard_answer')", name="ck_knowledge_kind"
        ),
        CheckConstraint(
            "source_kind IN ('manual', 'exploration', 'resource', 'submission')",
            name="ck_knowledge_source",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # NULL means the global library: not about one project, so no project's archive state
    # governs it. Set means this project owns the entry and its writes are gated on that
    # project being active.
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(
        String(20), server_default=text("'note'"), default=KIND_NOTE
    )
    status: Mapped[str] = mapped_column(
        String(20), server_default=text("'draft'"), default=STATUS_DRAFT, index=True
    )
    # The same normalized key attempts use, so an entry can be tied to a concept's history
    # without a second naming scheme. Empty means "not about one concept".
    concept_key: Mapped[str] = mapped_column(String(200), server_default=text("''"), default="")
    source_kind: Mapped[str] = mapped_column(
        String(20), server_default=text("'manual'"), default=SOURCE_MANUAL
    )
    # [{"kind": "exploration", "session_id": 3, "message_id": 9, "filename": "...", ...}]
    provenance: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    references: Mapped[list["ProjectKnowledge"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )


class ProjectKnowledge(Base):
    """Which projects point at an entry. The owner is on the entry, not here."""

    __tablename__ = "project_knowledge"
    __table_args__ = (
        UniqueConstraint("project_id", "knowledge_id", name="uq_project_knowledge"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    knowledge_id: Mapped[int] = mapped_column(ForeignKey("knowledge_entries.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    entry: Mapped[KnowledgeEntry] = relationship(back_populates="references")
    project = relationship("Project", backref=backref("knowledge_links", cascade="all, delete-orphan"))


class KnowledgeRelation(Base):
    """A directed edge between two entries.

    The pair is the primary key, so the same edge cannot be stored twice under two ids,
    and `from_id != to_id` is a constraint rather than a check in the router: an entry
    that is its own prerequisite is not a graph with a cycle, it is a typo.
    """

    __tablename__ = "knowledge_relations"
    __table_args__ = (
        CheckConstraint("from_id != to_id", name="ck_knowledge_relation_distinct"),
        CheckConstraint(
            "kind IN ('prerequisite', 'related', 'extends')", name="ck_knowledge_relation_kind"
        ),
    )

    from_id: Mapped[int] = mapped_column(
        ForeignKey("knowledge_entries.id"), primary_key=True
    )
    to_id: Mapped[int] = mapped_column(ForeignKey("knowledge_entries.id"), primary_key=True)
    kind: Mapped[str] = mapped_column(
        String(20), server_default=text("'related'"), default=RELATION_RELATED
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class KnowledgeRevision(Base):
    """One snapshot of what an entry said, and why the snapshot was taken.

    `version` counts from 1 within one entry and is unique per entry, so a comparison can
    name its two ends by number instead of by row id, which is what a person reading a
    diff actually wants to see.

    The status is stored beside the text on purpose. A revision of a pending_review entry
    and a revision of a confirmed one can hold identical words; keeping the status makes
    the list read as a history of decisions rather than a history of strings.
    """

    __tablename__ = "knowledge_revisions"
    __table_args__ = (
        UniqueConstraint("knowledge_id", "version", name="uq_knowledge_revision_version"),
        CheckConstraint(
            "reason IN ('created', 'edited', 'confirmed')", name="ck_knowledge_revision_reason"
        ),
        CheckConstraint(
            "status IN ('draft', 'pending_review', 'confirmed')",
            name="ck_knowledge_revision_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    knowledge_id: Mapped[int] = mapped_column(
        ForeignKey("knowledge_entries.id"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20))
    concept_key: Mapped[str] = mapped_column(
        String(200), server_default=text("''"), default=""
    )
    status: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    @property
    def body_chars(self) -> int:
        """Size only. The version list shows how much text a snapshot holds, not the text."""
        return len(self.body or "")


class ErrorCause(Base):
    """One diagnosed mistake, mapped to the knowledge point it belongs to.

    THE RULE THIS TABLE EXISTS TO KEEP. Recording a mistake never moves a review card.
    FSRS is written by `review.record_review` and by nothing else, because a schedule is
    a model of memory and the only evidence that memory changed is a retrieval the
    learner actually performed. An AI that said "you seem weak on matrix shapes" is not
    that evidence, and letting a chat message set `due` would corrupt the elapsed_days
    every later interval is fitted against.

    So this is a queue of claims, not a schedule. A claim closes when a review log for
    the same concept appears afterwards — evidence, derived at read time — or when a
    person dismisses it. Nothing here is a date, and nothing here is a rating.

    `concept_key` is required and `knowledge_id` is not: the mapping to a knowledge entry
    is often unavailable (the point has not been written yet) and that absence is worth
    recording rather than refusing. A mistake with no home is the clearest signal that
    the project is missing a note.

    `dismissed_at` is a person's judgement and is stored; closure by review is not stored,
    because a derived fact written down is a second source of truth that can disagree
    with the review logs.
    """

    __tablename__ = "error_causes"
    __table_args__ = (
        CheckConstraint(
            "cause IN ('concept_gap', 'procedure', 'notation', 'misread', 'tooling', "
            "'careless', 'unclassified')",
            name="ck_error_cause",
        ),
        CheckConstraint(
            "source_kind IN ('attempt', 'submission', 'manual')", name="ck_error_source"
        ),
        Index("ix_error_causes_project_created", "project_id", "created_at"),
        Index("ix_error_causes_concept", "concept_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    # NULL when no knowledge entry matches the concept yet. Not a failure: see the class
    # docstring.
    knowledge_id: Mapped[int | None] = mapped_column(
        ForeignKey("knowledge_entries.id"), nullable=True, index=True
    )
    concept_key: Mapped[str] = mapped_column(String(200))
    # The label as the learner or the quiz wrote it. The key is normalized and lossy, and
    # showing "gradient descent" for "Gradient Descent" would look like a typo.
    concept_label: Mapped[str] = mapped_column(String(200), server_default=text("''"), default="")
    cause: Mapped[str] = mapped_column(
        String(20), server_default=text("'unclassified'"), default=CAUSE_UNCLASSIFIED
    )
    note: Mapped[str] = mapped_column(Text, server_default=text("''"), default="")
    source_kind: Mapped[str] = mapped_column(
        String(20), server_default=text("'manual'"), default=ERROR_SOURCE_MANUAL
    )
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # What the evidence said at the time, e.g. "submitted 3x4, expected 3x3". A snapshot
    # for the same reason provenance is one: the attempt row can be deleted with its
    # course, and the diagnosis has to stay readable on its own.
    detail: Mapped[str] = mapped_column(Text, server_default=text("''"), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
