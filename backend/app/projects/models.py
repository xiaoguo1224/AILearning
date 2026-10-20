from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.db import Base
from app.models import Course, utcnow


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("mode IN ('course', 'research', 'practice')", name="ck_project_mode"),
        CheckConstraint("status IN ('active', 'archived')", name="ck_project_status"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    goal: Mapped[str] = mapped_column(Text, default="")
    mode: Mapped[str] = mapped_column(String(20), default="course")
    status: Mapped[str] = mapped_column(String(12), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    courses: Mapped[list["ProjectCourse"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="(ProjectCourse.position, ProjectCourse.course_id)",
    )


class ProjectCourse(Base):
    __tablename__ = "project_courses"
    __table_args__ = (CheckConstraint("position >= 0", name="ck_project_course_position"),)

    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), primary_key=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    project: Mapped[Project] = relationship(back_populates="courses")
    # SQLite foreign keys are off in the upstream app; ORM cleanup also prevents ID reuse leaks.
    course: Mapped[Course] = relationship(
        backref=backref("project_memberships", cascade="all, delete-orphan"),
    )
