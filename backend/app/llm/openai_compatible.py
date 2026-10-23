"""Chat Completions adapter for an explicitly configured Gemini/OpenAI gateway."""

import base64
import os
from urllib.parse import urlsplit

import httpx

from app.llm.base import LLMCallError, LLMResult


def _count(value: object) -> int | None:
    return value if type(value) is int and value >= 0 else None


class OpenAICompatibleProvider:
    is_paid = True
    # Assumed rather than probed: this adapter targets gateways, and which model sits
    # behind one is not knowable from here. A text-only model behind it will reject the
    # image part with an HTTP error, which surfaces as a failed call rather than a
    # verdict invented from a picture nobody looked at.
    supports_vision = True

    def __init__(self, name: str = "gemini"):
        self.name = name
        self.model = os.environ.get("LLM_MODEL", "").strip()
        self.base_url = os.environ.get("LLM_BASE_URL", "").strip().rstrip("/")
        self.api_key = os.environ.get("LLM_API_KEY", "").strip()
        self.timeout = 120

    def generate(
        self,
        system: str,
        prompt: str,
        max_tokens: int = 64000,
        images: list[tuple[str, bytes]] | None = None,
    ) -> LLMResult:
        try:
            url = urlsplit(self.base_url)
            valid_url = (
                url.scheme in ("http", "https") and url.hostname
                and not (url.username or url.password or url.query or url.fragment)
                and (url.scheme == "https" or url.hostname in ("localhost", "127.0.0.1", "::1"))
            )
        except ValueError:
            valid_url = False
        if not (valid_url and self.model and self.api_key):
            raise LLMCallError("Configure LLM_MODEL, LLM_BASE_URL (HTTPS), and LLM_API_KEY.")
        try:
            user_content: object = prompt
            if images:
                user_content = [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime};base64,{base64.b64encode(data).decode()}"
                        },
                    }
                    for mime, data in images
                ] + [{"type": "text", "text": prompt}]
            response = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_content},
                    ],
                    "max_tokens": max_tokens,
                    "stream": False,
                },
                timeout=httpx.Timeout(self.timeout, connect=10),
                follow_redirects=False,
            )
        except (httpx.HTTPError, ValueError):
            # Provider exceptions can contain credentials or gateway response text.
            raise LLMCallError("Model gateway connection failed or timed out.") from None
        if response.status_code != 200:
            raise LLMCallError(f"Model gateway returned HTTP {response.status_code}.")
        try:
            body = response.json()
        except ValueError:
            raise LLMCallError("Model gateway returned invalid JSON.") from None
        if not isinstance(body, dict):
            raise LLMCallError("Model gateway returned an invalid response.")
        usage = body.get("usage")
        usage = usage if isinstance(usage, dict) else {}
        input_tokens = _count(usage.get("prompt_tokens"))
        output_tokens = _count(usage.get("completion_tokens"))
        try:
            choice = body["choices"][0]
            message = choice["message"]
            content = message.get("content")
            usable = (
                choice.get("finish_reason") == "stop" and not message.get("refusal")
                and isinstance(content, str) and bool(content.strip())
            )
        except (KeyError, IndexError, TypeError, AttributeError):
            usable = False
        if not usable:
            raise LLMCallError(
                "Model gateway returned an incomplete, refused, or invalid answer.",
                input_tokens=input_tokens, output_tokens=output_tokens,
            )
        return LLMResult(content, input_tokens, output_tokens)
