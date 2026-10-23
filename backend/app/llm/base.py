from dataclasses import dataclass
from typing import Protocol


@dataclass
class LLMResult:
    text: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class LLMCallError(RuntimeError):
    """Raised when a provider call fails, possibly after consuming tokens (e.g. a refusal)."""

    def __init__(
        self,
        message: str,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
    ):
        super().__init__(message)
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class LLMProvider(Protocol):
    name: str  # anthropic, ollama, fake, gemini, openai
    model: str
    is_paid: bool  # Hosted providers participate in cost estimates and budget caps.
    # Whether this provider can be handed images at all. Checked before an answer that
    # is only a picture is graded: a text-only model would otherwise be asked to judge
    # an answer it cannot see, and would answer anyway.
    supports_vision: bool

    def generate(
        self,
        system: str,
        prompt: str,
        max_tokens: int = 64000,
        images: list[tuple[str, bytes]] | None = None,
    ) -> LLMResult:
        """Return the model's text response (plus token usage if reported) for a single
        system+user exchange.

        `images` is a list of (mime, bytes) attached to the user turn. Providers that
        cannot take images ignore them; callers check supports_vision first.
        """
        ...
