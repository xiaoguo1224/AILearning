"""Bounded inputs and model-output contract for resumable course generation."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class LessonOutline(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    summary: str = Field(default="", max_length=8000)


class ModuleOutline(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    lessons: list[LessonOutline] = Field(min_length=1, max_length=32)


class Outline(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=8000)
    modules: list[ModuleOutline] = Field(min_length=1, max_length=24)

    @model_validator(mode="after")
    def bounded_lessons(self):
        if sum(len(m.lessons) for m in self.modules) > 128:
            raise ValueError("At most 128 lessons are allowed.")
        return self


class GenerationInput(BaseModel):
    model_config = {"extra": "forbid"}

    topic: str = Field(min_length=1, max_length=20000)
    mode: Literal["auto", "outline", "full"] = "outline"
    difficulty: Literal[0, 1, 2] = 1

    @model_validator(mode="after")
    def nonempty_topic(self):
        self.topic = self.topic.strip()
        if not self.topic:
            raise ValueError("Provide a course topic.")
        return self


class ReviewInput(BaseModel):
    model_config = {"extra": "forbid"}

    action: Literal["approve", "revise"]
    revision: int = Field(ge=0)
    feedback: str = Field(default="", max_length=8000)

    @model_validator(mode="after")
    def nonempty_feedback(self):
        self.feedback = self.feedback.strip()
        if self.action == "revise" and not self.feedback:
            raise ValueError("Provide feedback for revision.")
        return self
