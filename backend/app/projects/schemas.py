from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
    model_validator,
)

from app.attempts import iso_utc

ProjectMode = Literal["course", "research", "practice"]
ProjectStatus = Literal["active", "archived"]
ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ProjectGoal = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ProjectName
    goal: ProjectGoal = ""
    mode: ProjectMode = "course"


class ProjectPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: ProjectName | None = None
    goal: ProjectGoal | None = None
    mode: ProjectMode | None = None
    expected_updated_at: datetime | None = None

    @model_validator(mode="after")
    def nonempty_patch(self):
        if not self.model_fields_set - {"expected_updated_at"} or any(
            getattr(self, field) is None for field in self.model_fields_set
        ):
            raise ValueError("Provide at least one project field; null values are not allowed.")
        if self.expected_updated_at is not None and self.expected_updated_at.utcoffset() is None:
            raise ValueError("The project version timestamp must include a timezone.")
        return self


class CourseLinkInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    position: int = Field(default=0, strict=True, ge=0, le=2_147_483_647)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    goal: str
    mode: ProjectMode
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class LinkedCourse(BaseModel):
    course_id: int
    title: str
    description: str
    position: int


class ProjectDetail(ProjectOut):
    courses: list[LinkedCourse]


class ProjectList(BaseModel):
    items: list[ProjectOut]
    total: int
