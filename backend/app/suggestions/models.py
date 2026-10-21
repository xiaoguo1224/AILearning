from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models import utcnow


class LearningSuggestion(Base):
    __tablename__ = "learning_suggestions"
    __table_args__ = (
        UniqueConstraint("source_error_id", "target_project_id", name="uq_suggestion_source_target"),
        CheckConstraint("state IN ('pending', 'accepted', 'rejected')", name="ck_suggestion_state"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    target_project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    source_error_id: Mapped[int] = mapped_column(ForeignKey("error_causes.id"), index=True)
    concept_key: Mapped[str] = mapped_column(String(200))
    concept_label: Mapped[str] = mapped_column(String(200))
    cause: Mapped[str] = mapped_column(String(40))
    evidence: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(20), default="pending")
    target_error_id: Mapped[int | None] = mapped_column(ForeignKey("error_causes.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
