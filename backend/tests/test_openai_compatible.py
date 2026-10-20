import httpx
import pytest

from app import models
from app.db import SessionLocal
from app.llm import get_provider
from app.llm.base import LLMCallError
from app.llm.openai_compatible import OpenAICompatibleProvider
from app.metering import CostLimitExceeded, MeteredLLM


@pytest.fixture(autouse=True)
def gateway(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "gemini-test")
    monkeypatch.setenv("LLM_BASE_URL", "https://gateway.example/v1/")
    monkeypatch.setenv("LLM_API_KEY", "secret-test-key")


def body(**choice):
    return {
        "choices": [{"message": {"content": "answer"}, "finish_reason": "stop", **choice}],
        "usage": {"prompt_tokens": 12, "completion_tokens": 6},
    }


def stub(monkeypatch, payload=None, status=200):
    sent = []

    def post(url, **kwargs):
        sent.append((url, kwargs))
        return httpx.Response(status, json=payload)

    monkeypatch.setattr(httpx, "post", post)
    return sent


def test_request_contract_and_usage(monkeypatch):
    sent = stub(monkeypatch, body())
    result = OpenAICompatibleProvider().generate("policy", "question", 123)
    assert (result.text, result.input_tokens, result.output_tokens) == ("answer", 12, 6)
    url, request = sent[0]
    assert url == "https://gateway.example/v1/chat/completions"
    assert request["headers"] == {"Authorization": "Bearer secret-test-key"}
    assert request["json"] == {
        "model": "gemini-test", "max_tokens": 123, "stream": False,
        "messages": [{"role": "system", "content": "policy"},
                     {"role": "user", "content": "question"}],
    }
    assert request["follow_redirects"] is False


@pytest.mark.parametrize("name", ["gemini", "openai"])
def test_selection_and_legacy_priority(monkeypatch, name):
    monkeypatch.delenv("STUDYFORGE_LLM_PROVIDER", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", name)
    assert get_provider().name == name
    monkeypatch.setenv("STUDYFORGE_LLM_PROVIDER", "fake")
    assert get_provider().name == "fake"


@pytest.mark.parametrize("name", ["", "typo"])
def test_unknown_provider_refused(monkeypatch, name):
    monkeypatch.setenv("STUDYFORGE_LLM_PROVIDER", name)
    with pytest.raises(LLMCallError, match="configuration"):
        get_provider()


@pytest.mark.parametrize("url", ["", "file:///etc/passwd", "http://remote.example/v1",
                                     "https://key@example.com/v1", "https://example.com?k=secret"])
def test_invalid_config_never_sends(monkeypatch, url):
    monkeypatch.setenv("LLM_BASE_URL", url)
    sent = stub(monkeypatch, body())
    with pytest.raises(LLMCallError, match="Configure"):
        OpenAICompatibleProvider().generate("s", "p")
    assert sent == []


@pytest.mark.parametrize("value", [None, True, -1, "12", 1.5])
def test_invalid_usage_is_unknown(monkeypatch, value):
    payload = body()
    payload["usage"] = {"prompt_tokens": value, "completion_tokens": value}
    stub(monkeypatch, payload)
    result = OpenAICompatibleProvider().generate("s", "p")
    assert result.input_tokens is None and result.output_tokens is None


@pytest.mark.parametrize("payload", [[], {}, {"choices": []}, body(finish_reason="length"),
                                     body(message={"content": "", "refusal": "secret-test-key"}),
                                     body(message={"content": ["invalid"]})])
def test_bad_answers_refused_without_leaking(monkeypatch, payload):
    stub(monkeypatch, payload)
    with pytest.raises(LLMCallError) as caught:
        OpenAICompatibleProvider().generate("s", "p")
    assert "secret-test-key" not in str(caught.value)


@pytest.mark.parametrize("status", [301, 401, 429, 500])
def test_http_errors_redacted(monkeypatch, status):
    stub(monkeypatch, {"error": "secret-test-key"}, status)
    with pytest.raises(LLMCallError, match=f"HTTP {status}") as caught:
        OpenAICompatibleProvider().generate("s", "p")
    assert "secret-test-key" not in str(caught.value)


def test_transport_errors_redacted(monkeypatch):
    def timeout(*args, **kwargs):
        raise httpx.ReadTimeout("secret-test-key")

    monkeypatch.setattr(httpx, "post", timeout)
    with pytest.raises(LLMCallError, match="timed out") as caught:
        OpenAICompatibleProvider().generate("s", "p")
    assert caught.value.__suppress_context__
    assert "secret-test-key" not in str(caught.value)


def test_non_json_refused(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(200, text="secret-test-key"))
    with pytest.raises(LLMCallError, match="invalid JSON"):
        OpenAICompatibleProvider().generate("s", "p")


def test_meter_preserves_usage_on_failed_answer_and_enforces_cap(monkeypatch, client):
    stub(monkeypatch, body(finish_reason="length"))
    meter = MeteredLLM(OpenAICompatibleProvider(), "gateway-failure-test")
    with pytest.raises(LLMCallError):
        meter.generate("tutor", "s", "p")
    with SessionLocal() as session:
        row = session.query(models.LlmCall).filter_by(run_id="gateway-failure-test").one()
        assert (row.provider, row.input_tokens, row.output_tokens) == ("gemini", 12, 6)
        assert row.approximate
    monkeypatch.setenv("STUDYFORGE_COST_LIMIT_USD", "0")
    sent = stub(monkeypatch, body())
    with pytest.raises(CostLimitExceeded):
        meter.generate("tutor", "s", "p")
    assert sent == []


def test_invalid_provider_generation_is_controlled(monkeypatch, client):
    monkeypatch.setenv("STUDYFORGE_LLM_PROVIDER", "typo")
    response = client.post("/courses/generate", json={"text": "Tensor broadcasting fundamentals."})
    assert response.status_code == 502
    assert "Traceback" not in response.text
