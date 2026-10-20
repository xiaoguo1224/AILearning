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
from app.projects.models import Project


class Submission(Base):
    """One manual upload or paste of learner code, kept as an immutable version.

    A submission is never rewritten: a re-test creates the next version of the same
    exercise. Nothing here is produced by running the learner's code, because the
    server has no execution path for it.
    """

    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "exercise_id", "version", name="uq_submission_version"
        ),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    exercise_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    user_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="submitted")  # submitted, reviewed
    # A variant draft this submission practises, when the learner accepted one. Stored
    # without a foreign key because SQLite cannot add the constraint to an existing
    # table, and both rows are written inside the transaction that validates the pair.
    variant_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped[Project] = relationship(
        backref=backref("submissions", cascade="all, delete-orphan")
    )
    artifacts: Mapped[list["SubmissionArtifact"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SubmissionArtifact.id",
    )
    reviews: Mapped[list["CodeReview"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="CodeReview.id.desc()",
    )


class SubmissionArtifact(Base):
    """A code or log file attached to a submission.

    The text lives in the database rather than on disk on purpose: these files are
    small, bounded (see service.MAX_*), and keeping them in the row means a backup of
    the SQLite file is a complete backup of the learner's submissions. `path` stays
    nullable for a future on-disk variant and is unused today.
    """

    __tablename__ = "submission_artifacts"
    __table_args__ = (
        CheckConstraint("kind IN ('code', 'log', 'config', 'output')", name="ck_artifact_kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(20))
    path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    submission: Mapped[Submission] = relationship(back_populates="artifacts")


class CodeReview(Base):
    """A static (and optionally model-assisted) review of one submission.

    `reference_solution` is deliberately absent from every default response: the PRD
    requires the learner to ask for it, and requires it to be labelled as unverified
    model output rather than presented as a confirmed answer. `hints_revealed` records
    how far up the hint ladder the learner has actually climbed.
    """

    __tablename__ = "code_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"), index=True)
    summary: Mapped[str] = mapped_column(Text)
    # Structured findings: file, line_start, line_end, category, severity,
    # evidence_type, description, suggestion.
    findings: Mapped[list] = mapped_column(JSON, default=list)
    hint_level_1: Mapped[str | None] = mapped_column(Text, nullable=True)  # clue / location
    hint_level_2: Mapped[str | None] = mapped_column(Text, nullable=True)  # concept / shape
    hint_level_3: Mapped[str | None] = mapped_column(Text, nullable=True)  # key fix
    reference_solution: Mapped[str | None] = mapped_column(Text, nullable=True)
    solution_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    solution_revealed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hints_revealed: Mapped[int] = mapped_column(Integer, server_default=text("0"), default=0)
    llm_status: Mapped[str] = mapped_column(
        String(20), server_default=text("'skipped'"), default="skipped"
    )  # skipped, used, unavailable
    model: Mapped[str] = mapped_column(String(100), default="static_ast")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    submission: Mapped[Submission] = relationship(back_populates="reviews")


class VariantExercise(Base):
    """A draft exercise derived from one submission's findings.

    It is a draft on purpose: model-written practice is useful immediately, but it is
    not a reviewed curriculum item, so nothing here is ever presented as confirmed
    course material.
    """

    __tablename__ = "variant_exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    source_submission_id: Mapped[int | None] = mapped_column(
        ForeignKey("submissions.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    prompt: Mapped[str] = mapped_column(Text)
    starter_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    acceptance: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(
        String(20), server_default=text("'draft'"), default="draft"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
