from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ContentReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_kind: Literal["lesson", "solution"]
    source_id: int = Field(strict=True, gt=0, le=2**63 - 1)


class ContentReviewOut(BaseModel):
    id: int
    project_id: int
    source_kind: str
    source_id: int
    source_hash: str
    knowledge_id: int
    knowledge_status: str
    source_unchanged: bool
    matches_source: bool
    approved: bool


class ContentReviewList(BaseModel):
    items: list[ContentReviewOut]
    total: int
