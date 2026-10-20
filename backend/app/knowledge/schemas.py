from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_serializer

from app.attempts import iso_utc
from app.knowledge.service import MAX_BODY_CHARS, MAX_TITLE_CHARS


class ProvenanceItem(BaseModel):
    """One thing this entry came from. Every field is optional on purpose.

    A provenance row is a snapshot of what was on screen when the entry was written, and
    a manual entry has none of it. Requiring any one field would make the honest empty
    case impossible to express.
    """

    model_config = ConfigDict(extra="forbid")
    kind: Literal["exploration", "resource", "submission", "manual"] | None = None
    resource_id: int | None = None
    chunk_id: int | None = None
    filename: str | None = Field(default=None, max_length=300)
    locator: str | None = Field(default=None, max_length=120)
    session_id: int | None = None
    message_id: int | None = None
    submission_id: int | None = None
    question: str | None = Field(default=None, max_length=2_000)

    @model_serializer
    def compact(self) -> dict:
        """Drop the fields this item does not use.

        The stored snapshot is already compact, so serialising every optional field as
        null would give the same fact two shapes — one in the database and one on the
        wire — and the next reader would have to know which one it was looking at.
        """
        return {key: value for key, value in self.__dict__.items() if value is not None}


class CreateKnowledgeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    body: str = Field(min_length=1, max_length=MAX_BODY_CHARS)
    kind: Literal["note", "definition", "standard_answer"] = "note"
    concept_key: str | None = Field(default=None, max_length=200)
    source_kind: Literal["manual", "exploration", "resource", "submission"] = "manual"
    provenance: list[ProvenanceItem] = Field(default_factory=list)


class UpdateKnowledgeInput(BaseModel):
    """A partial edit. Every field absent means "leave it alone"."""

    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=MAX_TITLE_CHARS)
    body: str | None = Field(default=None, min_length=1, max_length=MAX_BODY_CHARS)
    kind: Literal["note", "definition", "standard_answer"] | None = None
    concept_key: str | None = Field(default=None, max_length=200)


class RelationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to_id: int
    kind: Literal["prerequisite", "related", "extends"] = "related"


class KnowledgeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int | None = None
    title: str
    kind: Literal["note", "definition", "standard_answer"]
    status: Literal["draft", "pending_review", "confirmed"]
    concept_key: str = ""
    source_kind: str
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime | None = None

    @field_serializer("created_at", "updated_at", "confirmed_at")
    def utc_timestamp(self, value: datetime | None) -> str | None:
        return iso_utc(value) if value is not None else None


class RelationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    from_id: int
    to_id: int
    kind: Literal["prerequisite", "related", "extends"]


class ProjectRefOut(BaseModel):
    project_id: int
    name: str


class KnowledgeDetail(KnowledgeSummary):
    body: str
    provenance: list[ProvenanceItem] = Field(default_factory=list)
    # Which projects point at this entry, including its owner. Sent with the entry
    # because "who else reads this" is the fact that decides whether editing it is a
    # private act or a shared one.
    projects: list[ProjectRefOut] = Field(default_factory=list)
    prerequisites: list[RelationOut] = Field(default_factory=list)
    related: list[RelationOut] = Field(default_factory=list)
    # True when this request sent a confirmed entry back for review, so the screen can
    # say so instead of letting the badge change under the reader.
    sent_back_for_review: bool = False


class KnowledgeList(BaseModel):
    items: list[KnowledgeSummary]
    total: int
