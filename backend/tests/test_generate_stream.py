"""SSE course generation: outline first, lessons stream in as each finishes."""

import json


def _read_sse(response):
    events = []
    kind, data_lines = None, []
    for line in response.iter_lines():
        if line.startswith("event:"):
            kind = line[len("event:"):].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:"):].strip())
        elif line == "" and kind is not None:
            events.append((kind, json.loads("\n".join(data_lines))))
            kind, data_lines = None, []
    return events


def test_stream_emits_outline_lessons_done_in_order(client, monkeypatch):
    from app import main
    from app.llm.fake_provider import FakeProvider

    monkeypatch.setattr(main, "get_provider", lambda: FakeProvider())
    with client.stream(
        "POST",
        "/courses/generate/stream",
        json={"text": "transformer attention is all you need " * 50},
    ) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        events = _read_sse(response)

    kinds = [kind for kind, _ in events]
    assert kinds[0] == "outline"
    assert kinds[-1] == "done"
    assert set(kinds[1:-1]) == {"lesson"}

    outline = events[0][1]
    planned = sum(len(m["lessons"]) for m in outline["modules"])
    assert planned == len([k for k in kinds if k == "lesson"])

    done = events[-1][1]
    assert done["id"] > 0
    assert done["title"] == outline["title"]

    # Every lesson event carries its position so the client can place it even
    # though parallel authorship delivers them out of order.
    seen = set()
    for kind, payload in events:
        if kind != "lesson":
            continue
        key = (payload["module_index"], payload["lesson_index"])
        assert key not in seen
        seen.add(key)
        assert payload["lesson"]["content"]
        assert payload["lesson"]["quiz"]

    # The saved course matches what streamed.
    saved = client.get(f"/courses/{done['id']}").json()
    assert saved["title"] == outline["title"]
    assert sum(len(m["lessons"]) for m in saved["modules"]) == planned


def test_stream_reports_source_errors_before_first_byte(client):
    response = client.post(
        "/courses/generate/stream",
        json={"sources": [{"kind": "url", "value": "not-a-url"}]},
    )
    assert response.status_code == 422
