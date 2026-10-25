"""P2 acceptance: manual submission, static evidence, hint ladder, solution gating."""

import io

import pytest

from app.llm.base import LLMResult


def _project(client, name="PyTorch Practice"):
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


CODE_WITH_REDUCTION = """import torch

x = torch.randn(3, 4)
weights = torch.randn(4, 5)
w_col = weights[:, 0]
out = x @ w_col
"""

LOG_SHAPE_ERROR = """Traceback (most recent call last):
  File "solution.py", line 6, in <module>
    out = x @ w_col
RuntimeError: size mismatch, got 3, 4, 4
"""


def _submit(client, project_id, code=CODE_WITH_REDUCTION, log=LOG_SHAPE_ERROR, **extra):
    payload = {
        "exercise_id": "tensor-broadcast-01",
        "user_note": "local run crashed",
        "code_filename": "solution.py",
        "code_content": code,
    }
    if log is not None:
        payload["log_filename"] = "run.log"
        payload["log_content"] = log
    payload.update(extra)
    return client.post(f"/api/projects/{project_id}/submissions", json=payload)


def test_submission_records_code_and_log_without_running_them(client):
    project_id = _project(client)
    response = _submit(client, project_id)
    assert response.status_code == 201
    body = response.json()
    assert body["version"] == 1
    assert body["status"] == "submitted"
    assert {artifact["kind"] for artifact in body["artifacts"]} == {"code", "log"}
    assert all(artifact["size_bytes"] > 0 for artifact in body["artifacts"])
    assert body["privacy_warnings"] == []
    assert body["reviews"] == []


def test_ai_review_preserves_evidence_types_and_hides_the_answer(client):
    project_id = _project(client)
    submission = _submit(client, project_id).json()

    response = client.post(f"/api/submissions/{submission['id']}/review")
    assert response.status_code == 201
    review = response.json()

    evidence = {finding["evidence_type"] for finding in review["findings"]}
    assert evidence == {"needs_local_check"}
    categories = {finding["category"] for finding in review["findings"]}
    assert "tensor_shape_reduction" not in categories
    assert "likely_root_cause" not in categories

    # The ladder and the answer are not in the default payload.
    assert review["hint_level_1"]
    assert "hint_level_2" not in review
    assert "hint_level_3" not in review
    assert "reference_solution" not in review
    assert review["llm_status"] == "used"
    assert review["hints_revealed"] == 1

    detail = client.get(f"/api/submissions/{submission['id']}").json()
    assert detail["status"] == "reviewed"
    assert "reference_solution" not in detail["reviews"][0]


def test_hints_unlock_one_level_at_a_time_and_solution_is_labelled_unverified(client):
    project_id = _project(client)
    submission = _submit(client, project_id).json()
    review = client.post(f"/api/submissions/{submission['id']}/review").json()

    level_two = client.post(f"/api/reviews/{review['id']}/hints", json={"level": 2})
    assert level_two.status_code == 200
    assert level_two.json()["revealed"] == 2

    level_three = client.post(f"/api/reviews/{review['id']}/hints", json={"level": 3})
    assert level_three.status_code == 200
    assert "unsqueeze(1)" in level_three.json()["text"]

    invalid = client.post(f"/api/reviews/{review['id']}/hints", json={"level": 4})
    assert invalid.status_code == 422

    solution = client.post(f"/api/reviews/{review['id']}/solution")
    assert solution.status_code == 200
    body = solution.json()
    assert body["label"] == "ai_generated_unverified"
    assert "0:1" in body["reference_solution"]


def test_resubmission_increments_version_and_clears_the_hazard(client):
    project_id = _project(client)
    first = _submit(client, project_id).json()
    fixed = CODE_WITH_REDUCTION.replace("weights[:, 0]", "weights[:, 0:1]")
    second = _submit(client, project_id, code=fixed, log=None, user_note="fixed").json()

    assert first["version"] == 1
    assert second["version"] == 2

    review = client.post(f"/api/submissions/{second['id']}/review").json()
    assert not any(
        finding["category"] == "tensor_shape_reduction" for finding in review["findings"]
    )
    assert any(
        finding["evidence_type"] == "needs_local_check" for finding in review["findings"]
    )


def test_upload_accepts_py_and_log_and_rejects_unsafe_input(client):
    project_id = _project(client)

    accepted = client.post(
        f"/api/projects/{project_id}/submissions/upload",
        files={
            "code_file": ("solution.py", io.BytesIO(b"x = 1\n"), "text/x-python"),
            "log_file": ("run.log", io.BytesIO(LOG_SHAPE_ERROR.encode()), "text/plain"),
        },
        data={"exercise_id": "upload-01", "user_note": "uploaded"},
    )
    assert accepted.status_code == 201
    assert len(accepted.json()["artifacts"]) == 2

    wrong_type = client.post(
        f"/api/projects/{project_id}/submissions/upload",
        files={"code_file": ("payload.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
    )
    assert wrong_type.status_code == 422
    assert wrong_type.json()["detail"]["error"] == "unsupported_file_type"

    traversal = client.post(
        f"/api/projects/{project_id}/submissions/upload",
        files={"code_file": ("../../etc/passwd", io.BytesIO(b"root"), "text/plain")},
    )
    assert traversal.status_code == 422
    assert traversal.json()["detail"]["error"] == "invalid_filename"

    binary = client.post(
        f"/api/projects/{project_id}/submissions/upload",
        files={"code_file": ("model.py", io.BytesIO(b"\x00\x01\x02"), "text/plain")},
    )
    assert binary.status_code == 422
    assert binary.json()["detail"]["error"] == "binary_file"

    empty = client.post(
        f"/api/projects/{project_id}/submissions/upload",
        data={"exercise_id": "upload-02"},
    )
    assert empty.status_code == 422
    assert empty.json()["detail"]["error"] == "no_artifacts"


def test_oversized_code_is_refused(client):
    project_id = _project(client)
    response = _submit(client, project_id, code="x = 1\n" * 120_000, log=None)
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "file_too_large"


def test_credentials_in_code_are_reported_without_being_echoed(client):
    project_id = _project(client)
    secret = "sk-" + "a" * 32
    response = _submit(client, project_id, code=f"API_KEY = '{secret}'\n", log=None)
    assert response.status_code == 201
    warnings = response.json()["privacy_warnings"]
    assert warnings
    assert all(secret not in warning for warning in warnings)


def test_archived_project_is_read_only_for_submissions(client):
    project_id = _project(client, "Archive me")
    client.post(f"/api/projects/{project_id}/archive")
    response = _submit(client, project_id)
    assert response.status_code == 409
    assert response.json()["detail"]["error"] == "project_archived"


def test_submission_can_be_deleted(client):
    project_id = _project(client)
    submission = _submit(client, project_id).json()
    assert client.delete(f"/api/submissions/{submission['id']}").status_code == 204
    assert client.get(f"/api/submissions/{submission['id']}").status_code == 404


class _ReviewProvider:
    """Deterministic provider that answers the code-review prompt with valid JSON."""

    name = "fake"
    model = "stub-review"
    is_paid = False

    def __init__(self, text: str):
        self.text = text

    def generate(self, system: str, prompt: str, max_tokens: int = 64000):
        return LLMResult(text=self.text, input_tokens=10, output_tokens=20)


@pytest.fixture
def review_provider(monkeypatch):
    """Install one stub answer for both model-assisted surfaces."""
    from app.submissions import llm_review, llm_variant

    def install(text: str):
        provider = lambda: _ReviewProvider(text)
        monkeypatch.setattr(llm_review, "get_provider", provider)
        monkeypatch.setattr(llm_variant, "get_provider", provider)

    return install


def test_ai_review_stores_only_model_findings(client, review_provider):
    import json

    review_provider(
        json.dumps(
            {
                "summary": "The column axis is dropped before the matmul.",
                "findings": [
                    {
                        "file": "solution.py",
                        "line_start": 5,
                        "line_end": 5,
                        "category": "tensor_shape_reduction",
                        "severity": "warning",
                        "evidence_type": "confirmed_static",
                        "description": "Duplicate of the static claim, should be dropped.",
                        "suggestion": "Use [:, 0:1].",
                    },
                    {
                        "file": "solution.py",
                        "line_start": 6,
                        "line_end": 6,
                        "category": "matmul_contract",
                        "severity": "error",
                        "evidence_type": "inferred",
                        "description": "The inner dimensions cannot line up after the drop.",
                        "suggestion": "Print x.shape and w_col.shape before the matmul.",
                    },
                ],
                "hint_level_1": "Look at line 5.",
                "hint_level_2": "A scalar index removes an axis.",
                "hint_level_3": "Keep the axis with a slice.",
                "reference_solution": "w_col = weights[:, 0:1]",
            }
        )
    )
    project_id = _project(client)
    submission = _submit(client, project_id).json()

    review = client.post(
        f"/api/submissions/{submission['id']}/review", params={"use_llm": "true"}
    ).json()

    assert review["llm_status"] == "used"
    assert review["model"] == "llm"
    assert review["summary"] == "The column axis is dropped before the matmul."
    categories = [finding["category"] for finding in review["findings"]]
    assert categories.count("tensor_shape_reduction") == 1
    assert "matmul_contract" in categories
    assert review["hint_level_1"] == "Look at line 5."


def test_unusable_model_output_reports_failure_without_fallback(client, review_provider):
    review_provider("this is not json")
    project_id = _project(client)
    submission = _submit(client, project_id).json()

    response = client.post(
        f"/api/submissions/{submission['id']}/review", params={"use_llm": "true"}
    )
    assert response.status_code == 502
    assert client.get(f"/api/submissions/{submission['id']}").json()["reviews"] == []


def test_log_without_a_static_cause_states_uncertainty_instead_of_guessing(client):
    """P2-07: a log that disagrees with the code must not become a confident diagnosis."""
    project_id = _project(client)
    clean_code = "import torch\nx = torch.randn(2, 3)\nprint(x.sum())\n"
    submission = _submit(client, project_id, code=clean_code).json()

    review = client.post(f"/api/submissions/{submission['id']}/review").json()

    categories = {finding["category"] for finding in review["findings"]}
    assert "likely_root_cause" not in categories
    assert "needs_local_check" in categories
    assert "unverified" in review["summary"].lower()
    assert "your log reports" in review["summary"].lower()


def _variant_json() -> str:
    import json

    return json.dumps(
        {
            "title": "Keep the column axis",
            "prompt": (
                "Multiply a (5, 3) batch by one column of a (3, 2) weight matrix. "
                "The result must stay (5, 1)."
            ),
            "starter_code": (
                "x = torch.randn(5, 3)\nweights = torch.randn(3, 2)\nw_col = weights[:, 0]\n"
            ),
            "acceptance": "out.shape == (5, 1), and no scalar index removes an axis.",
        }
    )



def test_variant_draft_is_saved_as_draft_and_can_be_linked_to_a_resubmission(
    client, review_provider
):
    review_provider(_variant_json())
    project_id = _project(client)
    submission = _submit(client, project_id).json()

    created = client.post(f"/api/submissions/{submission['id']}/variant")
    assert created.status_code == 201
    variant = created.json()
    assert variant["status"] == "draft"
    assert variant["source_submission_id"] == submission["id"]
    assert "column" in variant["title"].lower()

    listed = client.get(f"/api/projects/{project_id}/variants").json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == variant["id"]

    follow_up = _submit(
        client,
        project_id,
        code="import torch\nw = torch.randn(3, 2)\nprint(w[:, 0:1].shape)\n",
        log=None,
        variant_id=variant["id"],
    )
    assert follow_up.status_code == 201
    assert follow_up.json()["variant_id"] == variant["id"]
    assert follow_up.json()["version"] == 2


def test_variant_generation_refuses_unusable_model_output(client, review_provider):
    review_provider("no json here")
    project_id = _project(client)
    submission = _submit(client, project_id).json()
    response = client.post(f"/api/submissions/{submission['id']}/variant")
    assert response.status_code == 502
    assert response.json()["detail"]["error"] == "variant_unavailable"


def test_variant_from_another_project_is_refused(client, review_provider):
    review_provider(_variant_json())
    first = _project(client, "First")
    second = _project(client, "Second")
    submission = _submit(client, first).json()
    variant = client.post(f"/api/submissions/{submission['id']}/variant").json()

    response = _submit(
        client,
        second,
        code="print(1)\n",
        log=None,
        variant_id=variant["id"],
    )
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "variant_not_found"


def _zip_bytes(members: dict[str, bytes]) -> bytes:
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in members.items():
            archive.writestr(name, content)
    return buf.getvalue()


def _upload_zip(client, project_id, filename, payload, **data):
    return client.post(
        f"/api/projects/{project_id}/submissions/upload",
        files={"code_file": (filename, io.BytesIO(payload), "application/zip")},
        data=data,
    )


def test_upload_expands_zip_into_one_code_artifact_per_file(client):
    project_id = _project(client)
    payload = _zip_bytes(
        {
            "model.py": b"import torch\n",
            "train.py": b"print('train')\n",
            "notes.md": b"# notes\n",
        }
    )
    response = _upload_zip(client, project_id, "project.zip", payload)
    assert response.status_code == 201
    artifacts = response.json()["artifacts"]
    assert {a["kind"] for a in artifacts} == {"code"}
    assert sorted(a["filename"] for a in artifacts) == ["model.py", "notes.md", "train.py"]


def test_upload_rejects_zip_with_bad_member_type_traversal_or_bomb(client):
    project_id = _project(client)

    bad_member = _upload_zip(
        client, project_id, "project.zip", _zip_bytes({"evil.exe": b"MZ"})
    )
    assert bad_member.status_code == 422
    assert bad_member.json()["detail"]["error"] == "unsupported_file_type"

    traversal = _upload_zip(
        client, project_id, "project.zip", _zip_bytes({"../evil.py": b"x = 1\n"})
    )
    assert traversal.status_code == 422
    assert traversal.json()["detail"]["error"] == "invalid_archive"

    bomb = _upload_zip(
        client,
        project_id,
        "project.zip",
        _zip_bytes({f"f{i}.py": b"x = 1\n" for i in range(60)}),
    )
    assert bomb.status_code == 422
    assert bomb.json()["detail"]["error"] == "archive_too_large"

    not_a_zip = _upload_zip(client, project_id, "project.zip", b"definitely not a zip")
    assert not_a_zip.status_code == 422
    assert not_a_zip.json()["detail"]["error"] == "invalid_archive"

    empty = _upload_zip(client, project_id, "project.zip", _zip_bytes({}))
    assert empty.status_code == 422
    assert empty.json()["detail"]["error"] == "empty_archive"


def test_upload_dedupes_zip_members_with_same_basename(client):
    project_id = _project(client)
    payload = _zip_bytes(
        {"pkg_a/model.py": b"a = 1\n", "pkg_b/model.py": b"b = 2\n"},
    )
    response = _upload_zip(client, project_id, "project.zip", payload)
    assert response.status_code == 201
    names = sorted(a["filename"] for a in response.json()["artifacts"])
    assert names == ["model.py", "model_2.py"]


def test_review_prompt_numbers_code_lines_for_the_model():
    """The model miscounted bare code lines (cited line 7 for a bug on line 8).

    The prompt must print 1-based `N|` numbers so findings and hints can cite
    the exact printed numbers instead of counting.
    """
    from app.submissions.llm_review import REVIEW_SYSTEM, ReviewContext, _prompt

    ctx = ReviewContext(
        exercise_id="matmul-01",
        user_note=None,
        artifacts=[("solution.py", "code", "import torch\nx = torch.ones(2, 2)\ny = x * 2\n")],
    )
    prompt = _prompt(ctx)
    assert "1|import torch" in prompt
    assert "2|x = torch.ones(2, 2)" in prompt
    assert "3|y = x * 2" in prompt
    assert "--- solution.py ---" in prompt
    assert "cite exactly those" in REVIEW_SYSTEM or "N|" in REVIEW_SYSTEM


@pytest.fixture(autouse=True)
def _fake_review_by_default(monkeypatch):
    """These integration tests never call the configured paid provider."""
    import json

    from app.submissions import llm_review

    payload = {
        "summary": "AI review: your log reports user evidence; runtime correctness is unverified.",
        "findings": [{"file": "solution.py", "line_start": 1, "line_end": 1,
                      "category": "needs_local_check", "severity": "info",
                      "evidence_type": "needs_local_check", "description": "Check intended output locally.",
                      "suggestion": "Compare output with the task."}],
        "hint_level_1": "Check the expected output.",
        "hint_level_2": "Check whether a column is intended.",
        "hint_level_3": "Use unsqueeze(1) only if a column is required.",
        "reference_solution": "w_col = weights[:, 0:1]",
    }
    monkeypatch.setattr(llm_review, "get_provider", lambda: _ReviewProvider(json.dumps(payload)))
