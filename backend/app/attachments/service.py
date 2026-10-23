"""Attachments for one answer: resolve ids, and turn them into prompt material."""

from sqlalchemy.orm import Session

from app import models
from app.attachments import extract, storage


def resolve(session: Session, ids: list[int]) -> list[models.Attachment]:
    """The attachment rows for these ids, in the order the learner attached them.

    Unknown ids are rejected rather than dropped: a missing attachment means the answer
    being graded is not the one the learner thinks they submitted.
    """
    if not ids:
        return []
    if len(ids) > storage.MAX_PER_ANSWER:
        raise storage.AttachmentError(f"一次最多 {storage.MAX_PER_ANSWER} 个附件。")
    rows = {
        row.id: row
        for row in session.query(models.Attachment).filter(models.Attachment.id.in_(ids))
    }
    missing = [attachment_id for attachment_id in ids if attachment_id not in rows]
    if missing:
        raise storage.AttachmentError("附件不存在，请重新上传。")
    return [rows[attachment_id] for attachment_id in ids]


def prompt_material(rows: list[models.Attachment]) -> tuple[str, list[tuple[str, bytes]]]:
    """(text block for the prompt, images to attach to the request).

    An unreadable file is reported inside the block instead of failing the whole
    grading call: the learner still wrote an answer, and a broken PDF must not turn
    their submission into a server error.
    """
    blocks: list[tuple[str, str, str]] = []
    images: list[tuple[str, bytes]] = []
    for row in rows:
        try:
            data = storage.load(row.sha256)
        except storage.AttachmentError as exc:
            blocks.append((row.filename, "text", f"（无法读取：{exc}）"))
            continue
        if row.kind == "image":
            images.append((row.mime, data))
            blocks.append((row.filename, row.kind, ""))
            continue
        try:
            text = extract.extract_text(row.kind, data)
        except storage.AttachmentError as exc:
            text = f"（无法读取：{exc}）"
        blocks.append((row.filename, row.kind, text))
    return extract.describe(blocks), images


def material_for(session: Session, ids: list[int]) -> tuple[str, list[tuple[str, bytes]]]:
    """`prompt_material` for a set of ids, resolved in one step.

    ONE entry point because there are two callers that must not drift: grading an
    answer and reviewing it. Grading saw the attachments first; the review then
    opened with "本次提交内容显示为空白" for an answer that was attached rather than
    typed, because it had been given only `attempt.submitted_answer`. Raises
    storage.AttachmentError, which each caller maps to its own 400.
    """
    if not ids:
        return "", []
    return prompt_material(resolve(session, ids))


def summaries(session: Session, ids: list[int]) -> list[dict]:
    """Metadata for attachments already recorded on an attempt, for redisplay.

    Unknown ids are SKIPPED here rather than raised, which is the opposite of
    `resolve`. This runs while rendering a question the learner already answered: a
    file that went missing from disk must cost them a chip, not the whole page.
    """
    if not ids:
        return []
    rows = {
        row.id: row
        for row in session.query(models.Attachment).filter(models.Attachment.id.in_(ids))
    }
    return [
        {
            "id": attachment_id,
            "filename": rows[attachment_id].filename,
            "kind": rows[attachment_id].kind,
            "mime": rows[attachment_id].mime,
            "size": rows[attachment_id].size,
        }
        for attachment_id in ids
        if attachment_id in rows
    ]
