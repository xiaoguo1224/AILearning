from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from app.attempts import iso_utc

EvidenceType = Literal["confirmed_static", "user_reported", "inferred", "needs_local_check"]
Severity = Literal["error", "warning", "info"]
LlmStatus = Literal["skipped", "used", "unavailable"]


class FindingOut(BaseModel):
    file: str
    line_start: int
    line_end: int
    category: str
    severity: Severity
    evidence_type: EvidenceType
    description: str
    suggestion: str


class CodeReviewOut(BaseModel):
    """What a review looks like by default: no level-2/3 hints, no reference solution.

    The learner climbs the ladder deliberately; a review response that shipped the
    answer would make the ladder decorative.
    """

    model_config = ConfigDict(from_attributes=True)
    id: int
    submission_id: int
    summary: str
    findings: list[FindingOut]
    hint_level_1: str | None = None
    hints_revealed: int = 1
    llm_status: LlmStatus = "skipped"
    model: str
    created_at: datetime

    @field_serializer("created_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class HintOut(BaseModel):
    level: int
    text: str
    revealed: int


class SolutionOut(BaseModel):
    reference_solution: str
    label: Literal["ai_generated_unverified", "static_reference_unverified"]
    revealed_at: datetime

    @field_serializer("revealed_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class HintRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    level: int = Field(ge=1, le=3, strict=True)


class ArtifactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    kind: str
    content: str | None = None
    size_bytes: int = 0
    truncated: bool = False
    sha256: str
    created_at: datetime

    @field_serializer("created_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class LatestReviewOut(BaseModel):
    id: int
    summary: str
    finding_count: int


class SubmissionSummaryOut(BaseModel):
    id: int
    project_id: int
    exercise_id: str | None = None
    version: int
    status: str
    user_note: str | None = None
    variant_id: int | None = None
    created_at: datetime
    artifact_count: int = 0
    latest_review: LatestReviewOut | None = None

    @field_serializer("created_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class SubmissionList(BaseModel):
    items: list[SubmissionSummaryOut]
    total: int


class SubmissionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    exercise_id: str | None = None
    version: int
    user_note: str | None = None
    variant_id: int | None = None
    status: str
    created_at: datetime
    artifacts: list[ArtifactOut] = Field(default_factory=list)
    reviews: list[CodeReviewOut] = Field(default_factory=list)
    privacy_warnings: list[str] = Field(default_factory=list)

    @field_serializer("created_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    source_submission_id: int | None = None
    # Set when the exercise was drafted from a free-exploration question instead of from a
    # submission. `source_question` is what the learner asked, kept verbatim so the
    # exercise can be shown next to the question that produced it.
    session_id: int | None = None
    source_question: str | None = None
    title: str
    prompt: str
    starter_code: str | None = None
    acceptance: str
    status: str
    created_at: datetime

    @field_serializer("created_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class VariantList(BaseModel):
    items: list[VariantOut]
    total: int


class CreateSubmissionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exercise_id: str | None = None
    variant_id: int | None = Field(default=None, ge=1, le=2_147_483_647)
    user_note: str | None = None
    code_filename: str = "solution.py"
    code_content: str | None = None
    log_filename: str | None = "run.log"
    log_content: str | None = None
