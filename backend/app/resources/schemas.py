from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.attempts import iso_utc

ResourceKind = Literal["pdf", "docx", "markdown", "text", "url"]
ParseStatus = Literal["pending", "completed", "failed"]


class ResourceChunkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ordinal: int
    locator: str
    text: str


class ResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    kind: ResourceKind
    sha256: str | None = None
    source_url: str | None = None
    parse_status: ParseStatus
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    def model_dump(self, *args, **kwargs):
        d = super().model_dump(*args, **kwargs)
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = iso_utc(d["created_at"])
        if isinstance(d.get("updated_at"), datetime):
            d["updated_at"] = iso_utc(d["updated_at"])
        return d


class ResourceDetail(ResourceOut):
    chunks: list[ResourceChunkOut] = Field(default_factory=list)


class ResourceSearchResult(BaseModel):
    chunk_id: int
    resource_id: int
    filename: str
    kind: str
    locator: str
    snippet: str


class AddUrlResourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=1, max_length=1000)
    title: str | None = Field(default=None, max_length=255)


class AddTextResourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    kind: Literal["markdown", "text"] = "markdown"
