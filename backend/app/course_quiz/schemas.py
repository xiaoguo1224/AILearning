"""Shapes for the course question bank and AI question generation."""

from pydantic import BaseModel, ConfigDict, Field


# The kinds the generator can be asked for. "mcq" and "short" are what course
# generation has always written; "truefalse" and "code" came with the question bank.
#
# "fill" was split out of "short" because the two need opposite grading: a fill-in
# answer is one term or number and exact match is the right judge, while a short
# answer is a sentence and only a model can tell whether it means the right thing.
# Keeping them as one kind forced one grading policy onto both. Items created before
# the split keep kind="short" — they were written as sentence answers, so they stay
# with the kind that grades them fairly.
QUIZ_KINDS = ("mcq", "fill", "short", "truefalse", "code")

KIND_LABELS = {
    "mcq": "选择题",
    "fill": "填空题",
    "short": "简答题",
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
    items: list[KindCount] = Field(min_length=1, max_length=len(QUIZ_KINDS))
    prompt: str | None = Field(default=None, max_length=500)


class QuizGenerateResult(BaseModel):
    course_id: int
    lesson_id: int | None
    created: list[QuizBankItem]


class AnswerAnalysisInput(BaseModel):
    """Which attempt to review.

    Omitted means the most recent lesson-quiz attempt on the question, which is what
    the UI means by "analyse my answer": the one just submitted.
    """

    model_config = ConfigDict(extra="forbid")

    attempt_id: int | None = None
