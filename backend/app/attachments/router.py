"""Upload and read the files a learner attaches to an answer."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app import models
from app.attachments import storage
from app.db import get_session

router = APIRouter(prefix="/api", tags=["attachments"])


@router.post("/attachments", status_code=201)
async def upload_attachment(
    file: UploadFile = File(...), session: Session = Depends(get_session)
):
    """Store one file and return its metadata.

    The upload is separate from answering on purpose: a learner attaches files while
    writing, and the answer POST then carries the ids. That keeps the answer request
    a small JSON body instead of a multipart one, and lets a file be attached, removed,
    and attached again without writing anything to the attempt history.
    """
    # Checked on UploadFile.size, before read(), so an oversized file is refused without
    # ever being pulled into memory.
    if file.size is not None and file.size > storage.MAX_BYTES:
        raise HTTPException(400, "单个文件不能超过 10 MB。")

    data = await file.read()
    try:
        digest, kind, mime = storage.save(data, file.filename or "")
    except storage.AttachmentError as exc:
        raise HTTPException(400, str(exc)) from exc

    row = session.query(models.Attachment).filter_by(sha256=digest).one_or_none()
    if row is None:
        row = models.Attachment(
            sha256=digest,
            filename=(file.filename or "")[:255],
            mime=mime,
            size=len(data),
            kind=kind,
        )
        session.add(row)
        session.commit()
    return {
        "id": row.id,
        "filename": row.filename,
        "mime": row.mime,
        "size": row.size,
        "kind": row.kind,
    }


@router.get("/attachments/{attachment_id}")
def read_attachment(
    attachment_id: int, session: Session = Depends(get_session)
):
    """The raw bytes, for rendering a thumbnail or reopening a past answer.

    private: this is one learner's own file on their own machine, and the whole app is
    single-user, but a shared cache has no business holding it either.
    """
    row = session.get(models.Attachment, attachment_id)
    if row is None:
        raise HTTPException(404, "Attachment not found")
    try:
        data = storage.load(row.sha256)
    except storage.AttachmentError as exc:
        raise HTTPException(404, str(exc)) from exc
    return Response(
        content=data,
        media_type=row.mime,
        headers={
            "Cache-Control": "private, max-age=86400",
            # Never let the browser guess: the mime came from sniffed bytes, and a
            # text/plain attachment containing HTML must not render as a page.
            "X-Content-Type-Options": "nosniff",
        },
    )
