from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_serializer, model_serializer

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
    expected_updated_at: AwareDatetime | None = None


class ConfirmKnowledgeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_updated_at: AwareDatetime


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


class DraftFromMessageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: int
    message_id: int


class CandidateOut(BaseModel):
    id: int
    title: str
    status: Literal["draft", "pending_review", "confirmed"]
    kind: Literal["note", "definition", "standard_answer"]
    # 1.0 is the same title, 0.9 a shared concept key, otherwise character similarity.
    score: float


class DraftResult(BaseModel):
    """What a draft request produced, and what it deliberately did not produce.

    `entry` is null when the title already existed: the request is answered with
    `duplicate_of` instead of a second copy of the same note. Both null would mean a bug,
    which is why the router never returns it that way.
    """

    entry: KnowledgeDetail | None = None
    duplicate_of: int | None = None
    candidates: list[CandidateOut] = Field(default_factory=list)


class RevisionSummary(BaseModel):
    """One snapshot, without its text.

    The list is what a reviewer scans before choosing two versions to compare, so it
    carries the facts that make a version recognisable — number, reason, status, size —
    and leaves the text to the detail endpoint and to the diff.
    """

    model_config = ConfigDict(from_attributes=True)
    version: int
    title: str
    kind: Literal["note", "definition", "standard_answer"]
    status: Literal["draft", "pending_review", "confirmed"]
    reason: Literal["created", "edited", "confirmed"]
    body_chars: int
    created_at: datetime

    @field_serializer("created_at")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class RevisionDetail(RevisionSummary):
    body: str
    concept_key: str = ""


class RevisionList(BaseModel):
    items: list[RevisionSummary]
    total: int
    # The version a person last signed off, or null when nothing was ever confirmed. The
    # UI opens the comparison on it by default, because "what changed since I approved
    # this" is the question the review step exists to answer.
    confirmed_version: int | None = None
    current_version: int = 0


class DiffLine(BaseModel):
    op: Literal["equal", "delete", "insert", "gap"]
    text: str


class CompareResult(BaseModel):
    """One revision against the entry as it stands now.

    The bodies are not repeated here — the diff carries the text, and sending both halves
    twice would make a large definition four times larger on the wire. The titles, kinds
    and statuses are sent because a change of kind or a status flip is not visible in a
    line diff of the body and matters more than most line changes do.
    """

    from_version: int
    from_title: str
    from_kind: str
    from_status: str
    to_title: str
    to_kind: str
    to_status: str
    changed: bool
    truncated: bool = False
    lines: list[DiffLine] = Field(default_factory=list)


class ErrorCauseInput(BaseModel):
    """One diagnosis, filed by hand.

    `concept_key` and `knowledge_id` are both optional and at least one is required; the
    router refuses the empty case with a sentence rather than guessing which concept was
    meant.
    """

    model_config = ConfigDict(extra="forbid")
    concept_key: str | None = Field(default=None, max_length=200)
    concept_label: str | None = Field(default=None, max_length=200)
    knowledge_id: int | None = Field(default=None, strict=True, gt=0, le=2**63 - 1)
    cause: Literal[
        "concept_gap", "procedure", "notation", "misread", "tooling", "careless", "unclassified"
    ] = "unclassified"
    note: str = Field(default="", max_length=4000)
    source_kind: Literal["attempt", "submission", "manual"] = "manual"
    source_id: int | None = Field(default=None, strict=True, gt=0, le=2**63 - 1)
    detail: str = Field(default="", max_length=4000)


class ErrorFromAttemptInput(BaseModel):
    """Diagnose a wrong quiz answer. The concept is taken from the attempt, not from here."""

    model_config = ConfigDict(extra="forbid")
    attempt_id: int = Field(strict=True, gt=0, le=2**63 - 1)
    cause: Literal[
        "concept_gap", "procedure", "notation", "misread", "tooling", "careless", "unclassified"
    ] = "unclassified"
    note: str = Field(default="", max_length=4000)


class ErrorCauseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    knowledge_id: int | None = None
    concept_key: str
    concept_label: str = ""
    cause: str
    note: str = ""
    source_kind: str
    source_id: int | None = None
    detail: str = ""
    created_at: datetime
    dismissed_at: datetime | None = None

    @field_serializer("created_at", "dismissed_at")
    def utc_timestamp(self, value: datetime | None) -> str | None:
        return iso_utc(value) if value is not None else None


class CauseCount(BaseModel):
    cause: str
    count: int


class ErrorCauseList(BaseModel):
    items: list[ErrorCauseOut]
    total: int
    # Counted across every diagnosis, dismissed ones included: dismissing says "do not
    # chase this", not "this did not happen".
    cause_counts: dict[str, int] = Field(default_factory=dict)


class ReviewTaskCard(BaseModel):
    """The scheduling state, read only. Not a due date the app acts on."""

    id: int
    state: str
    due: datetime | None = None
    lapses: int
    reps: int
    is_due: bool

    @field_serializer("due")
    def utc_timestamp(self, value: datetime | None) -> str | None:
        return iso_utc(value) if value is not None else None


class ReviewTaskOut(BaseModel):
    """One concept with open diagnoses, and where it belongs.

    `knowledge_id` is null when the project has never written an entry for this concept.
    That is the most useful state in the list — it says a note is missing — so it is a
    normal value and not an error.
    """

    concept_key: str
    concept_label: str
    knowledge_id: int | None = None
    knowledge_title: str | None = None
    knowledge_status: str | None = None
    open_errors: int
    causes: list[CauseCount] = Field(default_factory=list)
    latest_error_id: int
    latest_cause: str
    latest_note: str = ""
    latest_detail: str = ""
    first_seen: datetime
    last_seen: datetime
    card: ReviewTaskCard | None = None

    @field_serializer("first_seen", "last_seen")
    def utc_timestamp(self, value: datetime) -> str:
        return iso_utc(value)


class ReviewTaskList(BaseModel):
    items: list[ReviewTaskOut]
    total: int
