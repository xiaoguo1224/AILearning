import asyncio

import httpx
import pytest
from fastapi import FastAPI

from app.llm.base import LLMResult
from app.locale import TeachingLocaleMiddleware, normalize_locale, teaching_locale
from app.metering import MeteredLLM


@pytest.mark.parametrize("header,expected", [
    ("", "zh-CN"), ("zh-TW", "zh-CN"), ("en-US,en;q=0.9", "en"),
    ("EN;q=0.8", "en"), ("untrusted", "zh-CN"),
])
def test_normalize_locale(header, expected):
    assert normalize_locale(header) == expected


def test_request_language_reaches_meter_and_does_not_leak(monkeypatch):
    application = FastAPI()
    application.add_middleware(TeachingLocaleMiddleware)
    monkeypatch.setattr(MeteredLLM, "_record", lambda *args: None)

    class CaptureProvider:
        is_paid = False

        def generate(self, system, prompt, max_tokens):
            assert prompt == "unaltered source"
            assert "JSON schema" in system and "concept keys exactly" in system
            return LLMResult(system)

    @application.get("/")
    def answer():
        return {"system": MeteredLLM(CaptureProvider(), "locale-qa").generate(
            "tutor", "Evidence rules", "unaltered source"
        )}

    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application), base_url="http://qa") as client:
            english, chinese = await asyncio.gather(
                client.get("/", headers={"Accept-Language": "en"}), client.get("/")
            )
            assert "Response language: English." in english.json()["system"]
            assert "Response language: Simplified Chinese" in chinese.json()["system"]
            assert teaching_locale.get() == "zh-CN"

    asyncio.run(check())
