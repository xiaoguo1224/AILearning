"""Attachment bytes: sniffing, storage, and reading back.

The filename a learner picks never reaches the filesystem. Paths are derived from the
hash of the bytes, which makes traversal impossible by construction rather than by
sanitising, and makes the same file attached twice cost one copy.

Everything here treats the bytes as untrusted. The kind is decided by sniffing magic
numbers, never by the extension or the browser-supplied Content-Type: both are
client-controlled, and a .png header on an executable is one keystroke away.
"""

import hashlib
import io
import os
import zipfile
from pathlib import Path

MAX_BYTES = 10 * 1024 * 1024
MAX_PER_ANSWER = 5

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TEXT_MIME = "text/plain"


class AttachmentError(ValueError):
    """The bytes are not something we accept. The message is shown to the learner."""


def _dir() -> Path:
    root = Path(
        os.environ.get("STUDYFORGE_ATTACHMENTS_DIR", "data/attachments")
    ).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def path_for(digest: str) -> Path:
    """Two-level fan-out: ten thousand files in one directory is fine, a million is not."""
    return _dir() / digest[:2] / digest


def _looks_like_text(data: bytes) -> bool:
    """UTF-8 decodable, with no NUL in the head.

    A NUL byte is the cheapest reliable signal that something is binary; the full decode
    is what actually decides, and 10 MB of text is fast enough that guessing from a
    sample is not worth the false negatives it would add.
    """
    if b"\x00" in data[:4096]:
        return False
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def _sniff_ooxml(data: bytes) -> tuple[str, str]:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = zf.namelist()
            # Macro-enabled files are refused even though only XML is ever read: the
            # project's rule is that learner content is never executed, and accepting a
            # file whose whole purpose is a macro invites the next reader to run it.
            if any(name.endswith("vbaProject.bin") for name in names):
                raise AttachmentError(
                    "带宏的 Office 文件不受支持，请另存为 .docx / .xlsx 再上传。"
                )
            if any(name.startswith("word/") for name in names):
                return "docx", DOCX_MIME
            if any(name.startswith("xl/") for name in names):
                return "xlsx", XLSX_MIME
    except zipfile.BadZipFile as exc:
        raise AttachmentError("这个 Office 文件已损坏，读不出来。") from exc
    raise AttachmentError("不支持的文件类型。")


def sniff(data: bytes) -> tuple[str, str]:
    """(kind, mime), decided from the bytes alone."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image", "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image", "image/webp"
    if data.startswith(b"%PDF"):
        return "pdf", PDF_MIME
    if data.startswith(b"PK\x03\x04"):
        return _sniff_ooxml(data)
    if _looks_like_text(data):
        return "text", TEXT_MIME
    raise AttachmentError("不支持的文件类型：只收图片、PDF、Word、Excel 和文本/代码文件。")


def save(data: bytes, filename: str) -> tuple[str, str, str]:
    """Store the bytes; return (sha256, kind, mime). Idempotent by content."""
    if not data:
        raise AttachmentError("文件是空的。")
    if len(data) > MAX_BYTES:
        raise AttachmentError("单个文件不能超过 10 MB。")
    kind, mime = sniff(data)
    digest = hashlib.sha256(data).hexdigest()
    path = path_for(digest)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        # Written under a temp name and renamed, so a crash mid-write cannot leave a
        # half file that a later upload of the same content would then skip.
        tmp = path.with_name(digest + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)
    return digest, kind, mime


def load(digest: str) -> bytes:
    path = path_for(digest)
    if not path.exists():
        raise AttachmentError("附件文件丢失，请重新上传。")
    return path.read_bytes()
