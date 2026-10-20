from datetime import datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.db import Base
from app.models import utcnow
from app.projects.models import Project


class AgentSession(Base):
    """One free-exploration conversation inside a project.

    A session is project-scoped on purpose: the retrieved sources, the learner's goal
    and the citation trail all belong to one project, and a conversation that could
    silently read another project's material would make the citations meaningless.
    """

    __tablename__ = "agent_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    mode: Mapped[str] = mapped_column(
        String(20), server_default=text("'explore'"), default="explore"
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped[Project] = relationship(
        backref=backref("agent_sessions", cascade="all, delete-orphan")
    )
    messages: Mapped[list["AgentMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="AgentMessage.id",
    )


class AgentMessage(Base):
    """One turn, plus the exact sources the answer was allowed to cite.

    `source_refs` is a snapshot, not a join: a resource can be deleted later, and a
    citation that resolves to nothing would quietly turn a sourced claim into an
    unsourced one. The snapshot keeps the filename and locator that were shown.
    """

    __tablename__ = "agent_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="ck_agent_message_role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("agent_sessions.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)
    # Kept apart from `body` for the same reason the tutor splits them: "the project
    # material says" and "general knowledge" are different claims, and the page shows
    # them under different headings.
    beyond: Mapped[str | None] = mapped_column(Text, nullable=True)
    check_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{"marker": "S1", "chunk_id": 12, "resource_id": 3, "filename": "...", "locator": "p.2"}]
    source_refs: Mapped[list] = mapped_column(JSON, default=list)
    grounded: Mapped[int] = mapped_column(Integer, server_default=text("0"), default=0)
    model: Mapped[str] = mapped_column(String(100), server_default=text("''"), default="")
    run_id: Mapped[str] = mapped_column(String(64), server_default=text("''"), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    session: Mapped[AgentSession] = relationship(back_populates="messages")
