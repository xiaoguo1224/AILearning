"""Shapes for the course question bank and AI question generation."""

from pydantic import BaseModel, ConfigDict, Field


# The kinds the generator can be asked for. "mcq" and "short" are what course
# generation has always written; "truefalse" and "code" are new with the
# question bank so a generated set is not all multiple-choice and fill-in.
QUIZ_KINDS = ("mcq", "short", "truefalse", "code")

KIND_LABELS = {
    "mcq": "选择题",
    "short": "简答 / 填空",
    "truefalse": "判断题",
    "code": "代码题",
}


class QuizBankItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question: str
    kind: str
    options: list[str] = []
    concept: str = ""
    attempt_state: dict = {}
    solution: str | None = None


class QuizBankLesson(BaseModel):
    id: int
    title: str
    items: list[QuizBankItem]


class QuizBankModule(BaseModel):
    id: int
    title: str
    lessons: list[QuizBankLesson]


class QuizBank(BaseModel):
    course_id: int
    total: int
    modules: list[QuizBankModule]


class KindCount(BaseModel):
    """How many questions of one kind to generate."""

    model_config = ConfigDict(extra="forbid")

    kind: str
    count: int = Field(ge=0, le=20)


class QuizGenerateInput(BaseModel):
    """Ask the model for more practice questions.

    `lesson_id` scopes the material to one lesson; omitted means the whole
    course. `items` lists each kind and how many of it, so one call can ask for
    e.g. 2 选择题 + 1 判断题 + 1 代码题 instead of whatever the model feels
    like writing.
    """

    model_config = ConfigDict(extra="forbid")

    lesson_id: int | None = None
    items: list[KindCount] = Field(min_length=1, max_length=4)
    prompt: str | None = Field(default=None, max_length=500)


class QuizGenerateResult(BaseModel):
    course_id: int
    lesson_id: int | None
    created: list[QuizBankItem]
