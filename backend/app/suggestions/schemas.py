from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.attempts import iso_utc


class SuggestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_error_id: int = Field(strict=True, gt=0, le=2**63 - 1)
    target_project_id: int = Field(strict=True, gt=0, le=2**63 - 1)


class DecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["accepted", "rejected"]


class SuggestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source_project_id: int
    target_project_id: int
    source_name: str = ""
    target_name: str = ""
    source_error_id: int
    concept_key: str
    concept_label: str
    cause: str
    evidence: str
    state: Literal["pending", "accepted", "rejected"]
    target_error_id: int | None
    created_at: datetime
    decided_at: datetime | None

    @field_serializer("created_at", "decided_at")
    def timestamp(self, value: datetime | None) -> str | None:
        return iso_utc(value) if value else None


class SuggestionList(BaseModel):
    items: list[SuggestionOut]
    total: int
