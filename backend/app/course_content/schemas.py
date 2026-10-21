"""Shapes for markdown-folder course import and manual content editing."""

from pydantic import BaseModel, ConfigDict, Field


class ImportFile(BaseModel):
    """One .md file from the picked folder, path relative to the folder root."""

    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=200_000)


class ImportRequest(BaseModel):
    """Create a course straight from markdown files: no AI generation involved.

    `title`/`description` default from course.json when the folder carries one,
    else from the folder name.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    files: list[ImportFile] = Field(min_length=1, max_length=100)


class ImportResult(BaseModel):
    id: int
    title: str
    modules: int
    lessons: int


class LessonPatch(BaseModel):
    """Manual edit of a lesson's content. At least one field must be present."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=300)
    content: str | None = Field(default=None, max_length=500_000)
    concepts: list[str] | None = Field(default=None, max_length=20)


class CoursePatch(BaseModel):
    """Manual edit of a course's own fields."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
