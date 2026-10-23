"""Attachments: what is accepted, what is refused, and what reaches the model.

Every test points STUDYFORGE_ATTACHMENTS_DIR at a tmp dir so nothing lands in the real
data/attachments. The bytes are sniffed rather than trusted, so most of these are about
the gap between what a file claims to be and what it is.
"""

import io
import json
import zipfile

import pytest

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# Enough of a PNG to pass the magic-number check. Nothing decodes it: the server never
# renders an attachment, it only forwards it to a model.
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def attachments_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDYFORGE_ATTACHMENTS_DIR", str(tmp_path / "attachments"))
    return tmp_path


def _docx_bytes(text: str = "缩放是为了防止 softmax 饱和") -> bytes:
    """A minimal but valid DOCX: one paragraph of one run."""
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", body)
    return buffer.getvalue()


def _macro_docx_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", "<w:document/>")
        archive.writestr("word/vbaProject.bin", b"\x00" * 16)
    return buffer.getvalue()


def _xlsx_bytes() -> bytes:
    from openpyxl import Workbook

    book = Workbook()
    sheet = book.active
    sheet.title = "答案"
    sheet.append(["维度", "说明"])
    sheet.append(["d_k", "每个头的维度"])
    buffer = io.BytesIO()
    book.save(buffer)
    book.close()
    return buffer.getvalue()


def _upload(client, filename: str, data: bytes, content_type: str = "application/octet-stream"):
    return client.post(
        "/api/attachments", files={"file": (filename, data, content_type)}
    )


def _seed_short_item(answer: str = "防止点积过大导致 softmax 饱和") -> int:
    from app import models
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        course = models.Course(title="Attention", description="")
        module = models.Module(title="Module 1", position=0)
        lesson = models.Lesson(title="L", position=0, content="# L", concepts=["c"])
        item = models.QuizItem(
            question="自注意力里为什么除以根号 dk？",
            kind="short",
            options=[],
            answer=answer,
            concept="c",
        )
        lesson.quiz_items.append(item)
        module.lessons.append(lesson)
        course.modules.append(module)
        session.add(course)
        session.commit()
        return item.id
    finally:
        session.close()


class _RecordingGrader:
    """Stub provider that records what it was asked and answers with a verdict."""

    name, model, is_paid = "fake", "attach-test", False
    supports_vision = True

    def __init__(self, verdict: str | None = None):
        self.verdict = verdict or json.dumps({"correct": True, "feedback": "看到了。"})
        self.prompts: list[str] = []
        self.images: list[tuple[str, bytes]] | None = None

    def generate(self, system, prompt, max_tokens=64000, images=None):
        from app.llm.base import LLMResult

        self.prompts.append(prompt)
        self.images = images
        return LLMResult(text=self.verdict)


def _patch_grader(monkeypatch, provider=None):
    from app import main

    provider = provider or _RecordingGrader()
    monkeypatch.setattr(main, "get_provider", lambda: provider)
    return provider


def test_png_upload_is_stored_and_read_back(client):
    response = _upload(client, "photo.png", PNG_BYTES, "image/png")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["kind"] == "image"
    assert body["mime"] == "image/png"

    fetched = client.get(f"/api/attachments/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.content == PNG_BYTES
    assert fetched.headers["x-content-type-options"] == "nosniff"


def test_docx_text_is_extracted_for_grading(client, monkeypatch):
    """The attachment is the answer here, so its text has to reach the model."""
    item_id = _seed_short_item()
    uploaded = _upload(client, "answer.docx", _docx_bytes(), DOCX_MIME).json()
    assert uploaded["kind"] == "docx"

    provider = _patch_grader(monkeypatch)
    response = client.post(
        f"/quiz/{item_id}/answer",
        json={"answer": "", "attachment_ids": [uploaded["id"]]},
    )
    assert response.status_code == 200, response.text
    prompt = provider.prompts[0]
    assert "缩放是为了防止 softmax 饱和" in prompt
    # The prompt must say the words were absent, not leave the block looking blank.
    assert "只上传了附件" in prompt


def test_xlsx_text_is_extracted(client, monkeypatch):
    item_id = _seed_short_item()
    uploaded = _upload(client, "calc.xlsx", _xlsx_bytes(), XLSX_MIME).json()
    assert uploaded["kind"] == "xlsx"

    provider = _patch_grader(monkeypatch)
    client.post(
        f"/quiz/{item_id}/answer",
        json={"answer": "", "attachment_ids": [uploaded["id"]]},
    )
    prompt = provider.prompts[0]
    assert "每个头的维度" in prompt
    assert "[sheet: 答案]" in prompt


def test_image_is_sent_as_an_image_not_as_text(client, monkeypatch):
    item_id = _seed_short_item()
    uploaded = _upload(client, "note.png", PNG_BYTES, "image/png").json()

    provider = _patch_grader(monkeypatch)
    response = client.post(
        f"/quiz/{item_id}/answer",
        json={"answer": "我的思路写在图片里", "attachment_ids": [uploaded["id"]]},
    )
    assert response.status_code == 200, response.text
    assert provider.images is not None
    assert provider.images[0][0] == "image/png"
    assert provider.images[0][1] == PNG_BYTES
    # Named in the text block so the model knows a picture is there.
    assert "图片，内容见随附图像" in provider.prompts[0]


def test_attempt_records_the_attachment_ids(client, monkeypatch):
    item_id = _seed_short_item()
    uploaded = _upload(client, "answer.docx", _docx_bytes(), DOCX_MIME).json()
    _patch_grader(monkeypatch)

    client.post(
        f"/quiz/{item_id}/answer",
        json={"answer": "", "attachment_ids": [uploaded["id"]]},
    )

    from app import models
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        attempt = session.query(models.Attempt).filter_by(quiz_item_id=item_id).one()
        assert attempt.attachment_ids == [uploaded["id"]]
    finally:
        session.close()


def test_the_answer_carries_its_attachments_back_to_the_page(client, monkeypatch):
    """Re-opening the question must show what was submitted, not an empty box.

    The learner's report was "附件上传后，就无法查看了": the chips were local state,
    so a reload — or simply the next day — left a question that had been answered
    with a scanned page looking unanswered.
    """
    item_id = _seed_short_item()
    uploaded = _upload(client, "answer.docx", _docx_bytes(), DOCX_MIME).json()
    _patch_grader(monkeypatch)

    response = client.post(
        f"/quiz/{item_id}/answer",
        json={"answer": "", "attachment_ids": [uploaded["id"]]},
    )
    assert response.status_code == 200, response.text
    latest = response.json()["attempt_state"]["latest_quiz_attempt"]
    assert [row["id"] for row in latest["attachments"]] == [uploaded["id"]]
    assert latest["attachments"][0]["filename"] == "answer.docx"
    assert latest["attachments"][0]["kind"] == "docx"


def test_answer_analysis_sees_the_attachment(client, monkeypatch):
    """"How did I do?" has to read the file too, or it reviews a blank answer."""
    item_id = _seed_short_item()
    uploaded = _upload(client, "answer.docx", _docx_bytes(), DOCX_MIME).json()
    _patch_grader(monkeypatch)
    client.post(
        f"/quiz/{item_id}/answer",
        json={"answer": "", "attachment_ids": [uploaded["id"]]},
    )

    from app.course_quiz import router as quiz_router

    analysis_provider = _RecordingGrader(verdict="## 好在哪\n文件里说对了。")
    monkeypatch.setattr(quiz_router, "get_provider", lambda: analysis_provider)
    response = client.post(f"/api/quiz/{item_id}/answer-analysis", json={})
    assert response.status_code == 200, response.text
    assert "文件里说对了" in response.json()["analysis"]

    prompt = analysis_provider.prompts[0]
    assert "缩放是为了防止 softmax 饱和" in prompt, "the file's text must reach the review"
    assert "只上传了附件" in prompt, "an empty typed answer must not read as no answer at all"
    assert "SUBMITTED ATTACHMENTS" in prompt


def test_a_file_that_lies_about_its_type_is_refused(client):
    """Content-Type and extension are both client-controlled; the bytes decide."""
    response = _upload(client, "innocent.png", b"MZ\x90\x00" + b"\x00" * 64, "image/png")
    assert response.status_code == 400


def test_macro_enabled_office_files_are_refused(client):
    response = _upload(client, "notes.docx", _macro_docx_bytes(), DOCX_MIME)
    assert response.status_code == 400
    assert "宏" in response.json()["detail"]


def test_an_empty_file_is_refused(client):
    assert _upload(client, "empty.png", b"", "image/png").status_code == 400


def test_a_picture_cannot_answer_a_fill_in(client, monkeypatch):
    """A fill answer is one term; a picture is not that term."""
    from app import models
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        course = models.Course(title="C", description="")
        module = models.Module(title="M", position=0)
        lesson = models.Lesson(title="L", position=0, content="# L", concepts=["c"])
        item = models.QuizItem(question="Q?", kind="fill", options=[], answer="h", concept="c")
        lesson.quiz_items.append(item)
        module.lessons.append(lesson)
        course.modules.append(module)
        session.add(course)
        session.commit()
        item_id = item.id
    finally:
        session.close()

    uploaded = _upload(client, "note.png", PNG_BYTES, "image/png").json()
    _patch_grader(monkeypatch)
    response = client.post(
        f"/quiz/{item_id}/answer", json={"answer": "", "attachment_ids": [uploaded["id"]]}
    )
    assert response.status_code == 400
    assert "文字" in response.json()["detail"]


def test_an_image_is_refused_when_the_model_cannot_see(client, monkeypatch):
    """Better a clear refusal than a verdict invented from a picture nobody looked at."""
    item_id = _seed_short_item()
    uploaded = _upload(client, "note.png", PNG_BYTES, "image/png").json()

    class _BlindProvider(_RecordingGrader):
        supports_vision = False

    _patch_grader(monkeypatch, _BlindProvider())
    response = client.post(
        f"/quiz/{item_id}/answer", json={"answer": "", "attachment_ids": [uploaded["id"]]}
    )
    assert response.status_code == 400
    assert "图片" in response.json()["detail"]


def test_unknown_attachment_id_is_refused(client, monkeypatch):
    item_id = _seed_short_item()
    _patch_grader(monkeypatch)
    response = client.post(
        f"/quiz/{item_id}/answer", json={"answer": "文字", "attachment_ids": [999999]}
    )
    assert response.status_code == 400


def test_too_many_attachments_are_refused(client, monkeypatch):
    item_id = _seed_short_item()
    ids = [
        _upload(client, f"n{index}.png", PNG_BYTES + bytes([index]), "image/png").json()["id"]
        for index in range(6)
    ]
    _patch_grader(monkeypatch)
    response = client.post(
        f"/quiz/{item_id}/answer", json={"answer": "文字", "attachment_ids": ids}
    )
    assert response.status_code == 400
