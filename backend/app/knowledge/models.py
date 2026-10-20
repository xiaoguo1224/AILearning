"""Knowledge: what a project has learned, kept apart from what it was told.

THREE TABLES, AND THE REASON EACH EXISTS.

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
