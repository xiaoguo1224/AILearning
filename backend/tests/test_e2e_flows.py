"""P5-03: end-to-end validation of the three PRD user flows.

Each flow walks the real HTTP surface in the order a learner would:
project -> upload/ask -> review/practice -> diagnose -> remediate ->
resubmit/confirm -> cross-project suggestion. Model stages use the same
stub-provider pattern as test_agent.py / test_practice.py / test_submissions.py;
everything else runs against the real deterministic stack.
"""

import json

import pytest

from app.agent import router as agent_router
from app.llm.base import LLMResult
from app.submissions import llm_variant


def _project(client, name):
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def _paper(client, project_id):
    response = client.post(
        f"/api/projects/{project_id}/resources/text",
        json={
            "title": "SPDM paper",
            "kind": "markdown",
            "content": (
                "# SPDM: Shared and Private Decomposition\n\n"
                "SPDM decomposes each modality representation into a shared "
                "component and a private component. The shared component captures "
                "cross-modal commonality, while the private component preserves "
                "modality-specific information.\n\n"
                "Without the decomposition, modality-specific noise would pollute "
                "the aligned space. The private branch keeps discriminative "
                "modality signals so the shared branch can focus on alignment."
            ),
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


class _Stub:
    """Deterministic stand-in for one model stage."""

    name = "fake"
    model = "stub-e2e"
    is_paid = False

    def __init__(self, text):
        self.text = text

    def generate(self, system, prompt, max_tokens=64000):
        return LLMResult(text=self.text, input_tokens=11, output_tokens=22)


@pytest.fixture
def stub_provider(monkeypatch):
    def install(module, text):
        monkeypatch.setattr(module, "get_provider", lambda: _Stub(text))

    return install


def _explore_reply(**overrides):
    payload = {
        "answer": "The shared branch aligns modalities; the private branch keeps "
        "modality-specific signals [S1].",
        "citations": ["S1"],
        "beyond": None,
        "check": None,
    }
    payload.update(overrides)
    return json.dumps(payload)


def _practice_reply():
    return json.dumps(
        {
            "explanation": "Decomposition separates alignment from "
            "modality-specific detail [S1].",
            "beyond": None,
            "title": "Split a representation",
            "prompt": "Write the two-branch sketch for a toy embedding.",
            "starter_code": "import torch\n\nx = torch.randn(4, 8)\n# TODO: shared/private split\n",
            "acceptance": "two tensors returned",
        }
    )


def _variant_reply():
    return json.dumps(
        {
            "title": "Keep the column axis",
            "prompt": "Select column 2 of a (5, 6) weight matrix as a column matrix.",
            "starter_code": "import torch\n\nweights = torch.randn(5, 6)\n# TODO: column 2 as (5, 1)\n",
            "acceptance": "result.shape == (5, 1)",
            "source_concept": "broadcasting",
        }
    )


def test_flow1_pytorch_study_loop(client, stub_provider):
    """PRD 4.1: learn -> submit -> static review -> hints -> fix -> resubmit."""
    project_id = _project(client, "PyTorch E2E")

    curriculum = client.get(f"/api/projects/{project_id}/curriculum").json()
    assert "broadcasting" in [t["id"] for t in curriculum["pathway"]]

    v1 = client.post(
        f"/api/projects/{project_id}/submissions",
        json={
            "exercise_id": "broadcast-col",
            "code_filename": "solution.py",
            "code_content": "import torch\nweights = torch.randn(3, 4)\n"
            "w = weights[:, 0]\ny = weights @ w\nprint(y.shape)\n",
            "log_filename": "run.log",
            "log_content": "RuntimeError: mat1 and mat2 shapes cannot be multiplied (3x4 and 1x3)\n",
        },
    ).json()
    assert v1["version"] == 1

    review = client.post(f"/api/submissions/{v1['id']}/review").json()
    findings = review["findings"]
    assert [f["category"] for f in findings if f["category"] == "tensor_shape_reduction"]
    flagged = next(f for f in findings if f["category"] == "tensor_shape_reduction")
    assert flagged["evidence_type"] == "confirmed_static"

    hints = [
        client.post(f"/api/reviews/{review['id']}/hints", json={"level": n}).json()
        for n in (1, 2, 3)
    ]
    assert "removes that axis" in hints[1]["text"]
    assert hints[2]["revealed"] == 3

    solution = client.post(f"/api/reviews/{review['id']}/solution").json()
    assert solution["label"] == "ai_generated_unverified"

    stub_provider(llm_variant, _variant_reply())
    variant = client.post(f"/api/submissions/{v1['id']}/variant")
    assert variant.status_code == 201
    variant = variant.json()
    assert variant["status"] == "draft"

    v2 = client.post(
        f"/api/projects/{project_id}/submissions",
        json={
            "exercise_id": "broadcast-col",
            "variant_id": variant["id"],
            "code_filename": "solution.py",
            "code_content": "import torch\nweights = torch.randn(3, 4)\n"
            "w = weights[:, 0:1]\ny = weights @ w\nprint(y.shape)\n",
            "log_filename": "run.log",
            "log_content": "torch.Size([3, 1])\n",
        },
    ).json()
    assert v2["version"] == 2
    assert v2["variant_id"] == variant["id"]

    review2 = client.post(f"/api/submissions/{v2['id']}/review").json()
    assert not [
        f for f in review2["findings"] if f["category"] == "tensor_shape_reduction"
    ]

    cause = client.post(
        f"/api/projects/{project_id}/errors/from-review",
        json={
            "review_id": review["id"],
            "finding_index": 0,
            "concept_key": "broadcasting",
            "cause": "concept_gap",
            "note": "scalar index dropped the column axis",
        },
    )
    assert cause.status_code == 201
    tasks = client.get(f"/api/projects/{project_id}/review-tasks").json()
    assert tasks["total"] >= 1


def test_flow2_spdm_free_learning_loop(client, stub_provider):
    """PRD 4.2: upload paper -> grounded Q&A -> draft knowledge -> practice."""
    project_id = _project(client, "Multimodal E2E")
    _paper(client, project_id)

    session_id = client.post(
        f"/api/projects/{project_id}/sessions", json={"mode": "explore"}
    ).json()["id"]

    stub_provider(agent_router, _explore_reply())
    asked = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"body": "SPDM 为什么需要 Shared/Private 分解？"},
    )
    assert asked.status_code == 201
    assistant = asked.json()["assistant"]
    assert assistant["grounded"] is True
    assert len(assistant["source_refs"]) >= 1

    knowledge = client.get(f"/api/projects/{project_id}/knowledge").json()
    assert knowledge["total"] == 1
    draft = knowledge["items"][0]
    assert draft["status"] == "draft"
    detail = client.get(f"/api/knowledge/{draft['id']}").json()
    assert "shared" in detail["body"].lower()

    stub_provider(agent_router, _practice_reply())
    practice = client.post(f"/api/sessions/{session_id}/practice", json={})
    assert practice.status_code == 201
    exercise = practice.json()["exercise"]
    assert exercise["status"] == "draft"

    confirmed = client.post(
        f"/api/knowledge/{draft['id']}/confirm",
        json={"expected_updated_at": detail["updated_at"]},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed"


def test_flow3_cross_project_remediation_loop(client):
    """PRD 4.3: suggestion -> pending -> accept adds task, reject changes nothing."""
    source_id = _project(client, "PyTorch E2E")
    target_id = _project(client, "Multimodal E2E")

    cause = client.post(
        f"/api/projects/{source_id}/errors",
        json={"concept_key": "matmul", "cause": "concept_gap", "note": "inner dims"},
    ).json()

    before = client.get(f"/api/projects/{target_id}/errors").json()["total"]

    suggestion = client.post(
        f"/api/projects/{source_id}/suggestions",
        json={"source_error_id": cause["id"], "target_project_id": target_id},
    )
    assert suggestion.status_code == 201
    assert suggestion.json()["state"] == "pending"
    assert client.get(f"/api/projects/{target_id}/errors").json()["total"] == before

    decided = client.post(
        f"/api/suggestions/{suggestion.json()['id']}/decision",
        json={"decision": "accepted"},
    )
    assert decided.status_code == 200
    assert decided.json()["state"] == "accepted"
    assert client.get(f"/api/projects/{target_id}/errors").json()["total"] == before + 1

    cause2 = client.post(
        f"/api/projects/{source_id}/errors",
        json={"concept_key": "broadcasting", "cause": "concept_gap", "note": "second"},
    ).json()
    suggestion2 = client.post(
        f"/api/projects/{source_id}/suggestions",
        json={"source_error_id": cause2["id"], "target_project_id": target_id},
    ).json()
    rejected = client.post(
        f"/api/suggestions/{suggestion2['id']}/decision", json={"decision": "rejected"}
    )
    assert rejected.json()["state"] == "rejected"
    assert client.get(f"/api/projects/{target_id}/errors").json()["total"] == before + 1
