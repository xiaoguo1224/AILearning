from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.attempts import iso_utc
from app.submissions.schemas import VariantOut

MAX_BODY_CHARS = 4_000


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["explore"] = "explore"
    title: str | None = Field(default=None, max_length=200)


class MessageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: str = Field(min_length=1, max_length=MAX_BODY_CHARS)


class SourceRefOut(BaseModel):
    marker: str
    chunk_id: int
    resource_id: int
    filename: str
    locator: str = ""


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: Literal["user", "assistant"]
    body: str
    beyond: str | None = None
    check_question: str | None = None
    source_refs: list[SourceRefOut] = Field(default_factory=list)
    grounded: bool = False
    model: str = ""
    created_at: datetime

    @field_serializer("created_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    mode: str
    title: str | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    @field_serializer("created_at", "updated_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class SessionDetail(SessionOut):
    messages: list[MessageOut] = Field(default_factory=list)


class SessionList(BaseModel):
    items: list[SessionOut]
    total: int


class AskResult(BaseModel):
    user: MessageOut
    assistant: MessageOut


class PracticeInput(BaseModel):
    """The question to build practice from. Omitted means the session's last question."""

    model_config = ConfigDict(extra="forbid")
    body: str | None = Field(default=None, max_length=MAX_BODY_CHARS)


class PracticeResult(BaseModel):
    """A temporary explanation and one draft exercise, both produced by one call.

    The explanation is returned as a message so the conversation shows it, and the
    exercise carries its own id so the learner can submit code against it without
    anything else being linked up by hand.
    """

    message: MessageOut
    exercise: VariantOut
