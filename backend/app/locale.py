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
