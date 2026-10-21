from typing import Literal

from pydantic import BaseModel

Status = Literal["unassessed", "learning", "needs_review", "ready_for_advanced"]


class Reading(BaseModel):
    title: str
    url: str


class Prerequisite(BaseModel):
    key: str
    label: str
    ready: bool
    in_project: bool
    reading: Reading | None = None


class KnowledgePoint(BaseModel):
    key: str
    label: str
    lesson_ids: list[int]
    knowledge_ids: list[int]
    status: Status
    evidence_count: int
    distinct_items: int
    prerequisites: list[Prerequisite]
    reading: Reading | None = None
    extension: bool
    recommendation: Literal[
        "review", "prerequisite", "foundation", "consolidation", "advanced", "integrated"
    ]


class LessonTree(BaseModel):
    id: int
    title: str
    completed: bool
    concept_keys: list[str]


class ModuleTree(BaseModel):
    id: int
    title: str
    lessons: list[LessonTree]


class CourseTree(BaseModel):
    id: int
    title: str
    modules: list[ModuleTree]


class PathTopic(BaseModel):
    id: str
    title: str
    prerequisites: list[str]
    reading: Reading | None = None


class ProjectCurriculum(BaseModel):
    project_id: int
    courses: list[CourseTree]
    points: list[KnowledgePoint]
    pathway: list[PathTopic]
