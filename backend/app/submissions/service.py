"""Safe ingestion of learner-supplied code and logs.

The server never imports, compiles, executes or sandboxes what arrives here. It
decodes the text, records a hash, and hands it to static analysis. Everything in this
module is therefore about refusing the input that cannot be treated as plain text.
"""

import hashlib
import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.projects.models import Project
from app.projects.service import project_error
from app.submissions.models import Submission, SubmissionArtifact, VariantExercise

MAX_CODE_BYTES = 512 * 1024
MAX_LOG_BYTES = 2 * 1024 * 1024
MAX_NOTE_CHARS = 2_000
MAX_EXERCISE_ID_CHARS = 100
MAX_FILENAME_CHARS = 120

CODE_SUFFIXES = {".py", ".txt", ".md", ".json", ".yaml", ".yml"}
LOG_SUFFIXES = {".log", ".txt", ".out", ".err", ".md"}

# Ordered patterns are matched against the decoded text, never against the raw bytes,
# and the match is never echoed back: a warning that quotes the secret would leak it
# into the review row and the page.
SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("OpenAI-style key", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}")),
    ("Hugging Face token", re.compile(r"\bhf_[A-Za-z0-9]{20,}")),
    (
        "assigned secret",
        re.compile(
            r"(?i)\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*['\"][^'\"\n]{8,}['\"]"
        ),
    ),
)

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._\-\u4e00-\u9fff ]")


def _clean_filename(raw: str | None, default: str) -> str:
    """Return a bare, printable filename, or refuse a path-bearing one outright.

    `Path(...).name` alone would silently turn `../../etc/passwd` into `passwd` and
    hide an attempt that is worth telling the learner about.
    """
    name = (raw or "").strip()
    if not name:
        return default
    if "/" in name or "\\" in name or name in {".", ".."}:
        raise project_error(
            422, "invalid_filename", "Filenames must not contain directory separators."
        )
    if "\x00" in name:
        raise project_error(422, "invalid_filename", "Filenames must not contain null bytes.")
    cleaned = _SAFE_FILENAME.sub("_", name).strip() or default
    return cleaned[:MAX_FILENAME_CHARS]


def _decode(data: bytes, filename: str, limit: int, kind: str) -> str:
    if not data:
        raise project_error(422, "empty_file", f"{filename} is empty.")
    if len(data) > limit:
        raise project_error(
            422,
            "file_too_large",
            f"{filename} exceeds the {limit // 1024} KB limit for {kind} files.",
        )
    if b"\x00" in data:
        raise project_error(
            422, "binary_file", f"{filename} looks like a binary file; upload text only."
        )
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise project_error(
            422, "unsupported_encoding", f"{filename} is not valid UTF-8 text."
        ) from None


def _check_suffix(filename: str, allowed: set[str], kind: str) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in allowed:
        raise project_error(
            422,
            "unsupported_file_type",
            f"{filename} is not an accepted {kind} file. Allowed: {sorted(allowed)}",
        )


def scan_secrets(filename: str, content: str) -> list[str]:
    """Return human-readable warnings for likely credentials, without quoting them."""
    warnings: list[str] = []
    for label, pattern in SECRET_PATTERNS:
        match = pattern.search(content)
        if match is None:
            continue
        line = content.count("\n", 0, match.start()) + 1
        warnings.append(
            f"{filename} line {line}: possible {label} found. "
            "Remove credentials before uploading."
        )
    return warnings


def privacy_warnings(submission: Submission) -> list[str]:
    warnings: list[str] = []
    for artifact in submission.artifacts:
        if artifact.content:
            warnings.extend(scan_secrets(artifact.filename, artifact.content))
    return warnings


def _normalize_note(note: str | None) -> str | None:
    if note is None:
        return None
    trimmed = note.strip()
    if not trimmed:
        return None
    if len(trimmed) > MAX_NOTE_CHARS:
        raise project_error(
            422, "note_too_long", f"Note must be {MAX_NOTE_CHARS} characters or fewer."
        )
    return trimmed


def _normalize_exercise(exercise_id: str | None) -> str | None:
    if exercise_id is None:
        return None
    trimmed = exercise_id.strip()
    if not trimmed:
        return None
    if len(trimmed) > MAX_EXERCISE_ID_CHARS:
        raise project_error(
            422,
            "exercise_id_too_long",
            f"Exercise id must be {MAX_EXERCISE_ID_CHARS} characters or fewer.",
        )
    return trimmed


def _validated_variant(
    session: Session, project_id: int, variant_id: int | None
) -> int | None:
    """Refuse a variant that belongs to another project rather than silently dropping it."""
    if variant_id is None:
        return None
    variant = session.get(VariantExercise, variant_id)
    if variant is None or variant.project_id != project_id:
        raise project_error(
            422, "variant_not_found", "That variant draft does not belong to this project."
        )
    return variant.id


def build_submission(
    session: Session,
    project: Project,
    *,
    exercise_id: str | None,
    user_note: str | None,
    artifacts: list[tuple[str, str, str]],
    variant_id: int | None = None,
) -> Submission:
    """Persist one submission version.

    `artifacts` is a list of (filename, kind, content) already validated by the caller.
    The caller must hold the project write lock (see writable_project) before calling,
    which is what makes the version read-then-insert below safe.
    """
    if not artifacts:
        raise project_error(422, "no_artifacts", "Provide code, a log, or both.")

    exercise = _normalize_exercise(exercise_id)
    note = _normalize_note(user_note)

    version = 1
    if exercise is not None:
        latest = (
            session.query(Submission.version)
            .filter_by(project_id=project.id, exercise_id=exercise)
            .order_by(Submission.version.desc())
            .first()
        )
        if latest is not None:
            version = latest[0] + 1

    submission = Submission(
        project_id=project.id,
        exercise_id=exercise,
        version=version,
        user_note=note,
        variant_id=_validated_variant(session, project.id, variant_id),
        status="submitted",
    )
    session.add(submission)
    session.flush()

    for filename, kind, content in artifacts:
        session.add(
            SubmissionArtifact(
                submission_id=submission.id,
                filename=filename,
                kind=kind,
                content=content,
                size_bytes=len(content.encode("utf-8")),
                sha256=hashlib.sha256(content.encode("utf-8")).hexdigest(),
            )
        )
    return submission


def text_artifacts(
    *,
    code_filename: str | None,
    code_content: str | None,
    log_filename: str | None,
    log_content: str | None,
) -> list[tuple[str, str, str]]:
    """Validate pasted text the same way an uploaded file is validated."""
    artifacts: list[tuple[str, str, str]] = []
    if code_content is not None and code_content.strip():
        filename = _clean_filename(code_filename, "solution.py")
        _check_suffix(filename, CODE_SUFFIXES, "code")
        content = _decode(code_content.encode("utf-8"), filename, MAX_CODE_BYTES, "code")
        artifacts.append((filename, "code", content))
    if log_content is not None and log_content.strip():
        filename = _clean_filename(log_filename, "run.log")
        _check_suffix(filename, LOG_SUFFIXES, "log")
        content = _decode(log_content.encode("utf-8"), filename, MAX_LOG_BYTES, "log")
        artifacts.append((filename, "log", content))
    return artifacts


def file_artifact(data: bytes, filename: str | None, kind: str) -> tuple[str, str, str]:
    default = "solution.py" if kind == "code" else "run.log"
    name = _clean_filename(filename, default)
    allowed = CODE_SUFFIXES if kind == "code" else LOG_SUFFIXES
    limit = MAX_CODE_BYTES if kind == "code" else MAX_LOG_BYTES
    _check_suffix(name, allowed, kind)
    return (name, kind, _decode(data, name, limit, kind))
