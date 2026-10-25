"""Safe ingestion of learner-supplied code and logs.

The server never imports, compiles, executes or sandboxes what arrives here. It
decodes the text, records a hash, and hands it to static analysis. Everything in this
module is therefore about refusing the input that cannot be treated as plain text.
"""

import hashlib
import io
import re
import zipfile
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
ZIP_SUFFIXES = {".zip"}

# A zip is a project, not a file: it may hold several modules, so the caps are
# looser than a single pasted file but still bounded against zip bombs.
MAX_ZIP_BYTES = 5 * 1024 * 1024
MAX_ZIP_FILES = 50
MAX_ZIP_TOTAL_BYTES = 2 * 1024 * 1024

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
    session.flush()
    session.expire(submission, ["artifacts"])
    from app.answer_history.service import capture_submission

    capture_submission(session, submission)
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


def zip_artifacts(data: bytes, filename: str | None) -> list[tuple[str, str, str]]:
    """Unpack an uploaded .zip into one code artifact per text file inside.

    Multi-file projects cannot be pasted as one file, so the archive is expanded
    server-side and each member is validated exactly like an uploaded code file.
    Refused outright: non-zip bytes, encrypted members, absolute paths and
    ".." traversal, members whose suffix is not an accepted code type, and
    archives that exceed the file-count or total-size caps (zip-bomb guard).
    Directories, __MACOSX noise and .DS_Store files are skipped silently.
    """
    name = _clean_filename(filename, "project.zip")
    _check_suffix(name, ZIP_SUFFIXES, "code")
    if not data:
        raise project_error(422, "empty_file", f"{name} is empty.")
    if len(data) > MAX_ZIP_BYTES:
        raise project_error(
            422,
            "file_too_large",
            f"{name} exceeds the {MAX_ZIP_BYTES // 1024 // 1024} MB limit for zip uploads.",
        )
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise project_error(
            422, "invalid_archive", f"{name} is not a readable zip archive."
        ) from None

    artifacts: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    total = 0
    for info in archive.infolist():
        raw = info.filename
        if info.is_dir() or raw.endswith("/"):
            continue
        base = Path(raw).name
        if base in {"", ".DS_Store"} or raw.startswith("__MACOSX/"):
            continue
        if info.flag_bits & 0x1:
            raise project_error(
                422, "encrypted_archive", f"{name}: {base} is encrypted; upload an unencrypted zip."
            )
        # Zip Slip guard: reject anything that is not a plain relative path.
        if raw.startswith("/") or "\\" in raw or ".." in Path(raw).parts:
            raise project_error(
                422, "invalid_archive", f"{name}: {raw} is not a safe path inside the zip."
            )
        _check_suffix(base, CODE_SUFFIXES, "code")
        if len(artifacts) >= MAX_ZIP_FILES:
            raise project_error(
                422,
                "archive_too_large",
                f"{name} holds more than {MAX_ZIP_FILES} files.",
            )
        member = archive.read(info.filename)
        total += len(member)
        if total > MAX_ZIP_TOTAL_BYTES:
            raise project_error(
                422,
                "archive_too_large",
                f"{name} unpacks to more than {MAX_ZIP_TOTAL_BYTES // 1024} KB of text.",
            )
        clean = _clean_filename(base, "file.py")
        stem, suffix = Path(clean).stem, Path(clean).suffix
        deduped, n = clean, 2
        while deduped in seen:
            deduped = _clean_filename(f"{stem}_{n}{suffix}", "file.py")
            n += 1
        seen.add(deduped)
        artifacts.append((deduped, "code", _decode(member, deduped, MAX_CODE_BYTES, "code")))
    archive.close()
    if not artifacts:
        raise project_error(
            422, "empty_archive", f"{name} contains no accepted code files."
        )
    return artifacts
