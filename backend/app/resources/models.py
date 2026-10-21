from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.db import Base
from app.models import utcnow
from app.projects.models import Project


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('pdf', 'docx', 'markdown', 'text', 'url')", name="ck_resource_kind"
        ),
        CheckConstraint(
            "parse_status IN ('pending', 'completed', 'failed')", name="ck_resource_parse_status"
        ),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(20))
    path: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # local storage path if file
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    parse_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    chunks: Mapped[list["ResourceChunk"]] = relationship(
        back_populates="resource",
        cascade="all, delete-orphan",
        order_by="ResourceChunk.ordinal",
    )
    courses: Mapped[list["CourseResource"]] = relationship(
        back_populates="resource",
        cascade="all, delete-orphan",
    )
    projects: Mapped[list["ProjectResource"]] = relationship(
        back_populates="resource",
        cascade="all, delete-orphan",
    )


class ProjectResource(Base):
    __tablename__ = "project_resources"

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped[Project] = relationship(
        backref=backref("project_resources", cascade="all, delete-orphan")
    )
    resource: Mapped[Resource] = relationship(back_populates="projects")


class CourseResource(Base):
    __tablename__ = "course_resources"

    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), primary_key=True)
    resource_id: Mapped[int] = mapped_column(
        ForeignKey("resources.id"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    resource: Mapped[Resource] = relationship(back_populates="courses")


class ResourceChunk(Base):
    __tablename__ = "resource_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    locator: Mapped[str] = mapped_column(String(100))  # e.g. "page 3", "section 1"
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    resource: Mapped[Resource] = relationship(back_populates="chunks")
