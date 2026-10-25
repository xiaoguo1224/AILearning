"""Independent snapshots: source deletion must not cascade into learning history."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models import utcnow


class AnswerSnapshot(Base):
    __tablename__ = "answer_snapshots"
    __table_args__ = (
        UniqueConstraint("source_type", "source_id", "source_created_at"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_type: Mapped[str] = mapped_column(String(20))
    source_id: Mapped[int] = mapped_column(Integer)
    source_created_at: Mapped[datetime] = mapped_column(DateTime)
    question_id: Mapped[int | None] = mapped_column(Integer, index=True)
    course_id: Mapped[int | None] = mapped_column(Integer, index=True)
    lesson_id: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(30))
    snapshot: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AnswerSnapshotEvent(Base):
    __tablename__ = "answer_snapshot_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(Integer, index=True)
    event_key: Mapped[str] = mapped_column(String(160), unique=True)
    kind: Mapped[str] = mapped_column(String(30))
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
