"""Background AI jobs: long operations that survive page navigation.

The learner starts a job (course generation, regeneration, quiz generation,
LLM review), navigates away, and comes back later — the job keeps running on
the server and the result waits for them. Jobs are NOT tied to the HTTP
request that created them.
"""

from datetime import datetime

from sqlalchemy import JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models import utcnow


class Job(Base):
    """One background AI operation.

    `type` is one of: course_generate, course_regenerate, lesson_regenerate,
    quiz_generate, code_review_llm.

    `status`: pending → running → completed | failed | cancelled.

    `progress` is type-specific JSON the frontend renders (e.g. {"done": 3,
    "total": 10} or {"stage": "outline"}). `result` is type-specific JSON
    (e.g. {"course_id": 5} or {"draft": {...}}). `error` is a human-readable
    message when status is failed.

    `ref_type`/`ref_id` scope the job: the course, lesson, quiz item or
    submission it belongs to, so the UI can link back.
    """

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    type: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(20), index=True, default="pending")
    progress: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    trace: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ref_type: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
