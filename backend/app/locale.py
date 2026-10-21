"""Request-scoped teaching language; stored source text and identifiers stay unchanged."""

from contextvars import ContextVar

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

teaching_locale: ContextVar[str] = ContextVar("teaching_locale", default="zh-CN")


def normalize_locale(header: str) -> str:
    # The UI sends one explicit locale. Also accept the first browser language.
    language = header.split(",", 1)[0].split(";", 1)[0].strip().lower()
    return "en" if language == "en" or language.startswith("en-") else "zh-CN"


class TeachingLocaleMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        token = teaching_locale.set(normalize_locale(Headers(scope=scope).get("accept-language", "")))
        try:
            await self.app(scope, receive, send)
        finally:
            teaching_locale.reset(token)


def teaching_system(system: str) -> str:
    language = "English" if teaching_locale.get() == "en" else "Simplified Chinese (简体中文)"
    return (
        f"{system}\n\nResponse language: {language}. Write learner-facing explanations, titles, "
        "questions and hints in this language. Preserve the required JSON schema, enum values, "
        "source quotations, code, identifiers and existing concept keys exactly. "
        "This language preference does not override evidence or safety rules."
    )


# User-facing messages for the project-scoped flows (P4/P5 conflict and diagnostic
# errors). The `error` code is the stable contract for the frontend and tests; the
# message follows the request locale. Codes not listed here keep the message the
# caller passed, unchanged.
ERROR_MESSAGES: dict[str, tuple[str, str]] = {
    # code: (zh-CN, en)
    "knowledge_changed": (
        "该条目已被更新，请重新加载并检查后再保存或确认。",
        "This entry changed. Reload and review it before saving or confirming.",
    ),
    "project_archived": (
        "项目已归档，只读。",
        "Archived projects are read-only.",
    ),
    "suggestion_decided": (
        "该建议已处理。",
        "This suggestion has already been decided.",
    ),
    "diagnosis_closed": (
        "该诊断已无需复查。",
        "This diagnosis no longer needs review.",
    ),
    "same_project": (
        "请选择另一个项目作为建议目标。",
        "Choose a different project for this suggestion.",
    ),
    "unverified_source": (
        "请使用证据专用接口来关联来源。",
        "Use the evidence-specific endpoint to attach a source.",
    ),
    "not_a_diagnosis": (
        "请选择一条有证据的错误或警告。",
        "Choose an error or warning with evidence.",
    ),
    "concept_mismatch": (
        "该概念与这条知识不匹配。",
        "The concept does not match this knowledge entry.",
    ),
}


def localize_error(code: str, fallback: str) -> str:
    """Pick the user-facing error message for the current request locale."""
    pair = ERROR_MESSAGES.get(code)
    if pair is None:
        return fallback
    zh, en = pair
    return en if teaching_locale.get() == "en" else zh
