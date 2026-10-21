from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models import utcnow


class ContentReview(Base):
    __tablename__ = "content_reviews"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "source_kind", "source_id", "source_hash", name="uq_content_review_source"
        ),
        CheckConstraint("source_kind IN ('lesson', 'solution')", name="ck_content_review_source"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    source_kind: Mapped[str] = mapped_column(String(20))
    source_id: Mapped[int] = mapped_column(Integer)
    source_hash: Mapped[str] = mapped_column(String(64))
    knowledge_id: Mapped[int] = mapped_column(ForeignKey("knowledge_entries.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
