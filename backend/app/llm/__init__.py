import os

from app.llm.base import LLMCallError, LLMProvider


def get_provider() -> LLMProvider:
    name = os.environ.get("STUDYFORGE_LLM_PROVIDER", os.environ.get("LLM_PROVIDER", "anthropic"))
    if name == "ollama":
        from app.llm.ollama_provider import OllamaProvider

        return OllamaProvider()
    if name == "fake":
        from app.llm.fake_provider import FakeProvider

        return FakeProvider()
    if name in ("gemini", "openai"):
        from app.llm.openai_compatible import OpenAICompatibleProvider

        return OpenAICompatibleProvider(name=name)
    if name == "anthropic":
        from app.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider()
    raise LLMCallError("Unsupported LLM provider configuration.")
