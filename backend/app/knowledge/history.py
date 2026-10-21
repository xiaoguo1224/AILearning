"""What an entry used to say, and how to show the difference.

WHY FULL SNAPSHOTS AND NOT A PATCH LIST. A revision stores the whole entry, not the edit
that produced it. A patch chain is smaller and worse at the only job this table has:
answering "what did this say when I confirmed it" without a reconstruction that can drift
after one bad replay. These entries are a few thousand characters at most; the storage
argument does not survive contact with the use.

WHAT A DIFF IS FOR HERE. Not editing — the editor already shows the text. It is for the
review step: somebody confirmed a definition, the definition changed afterwards, and the
question is whether the new words are still the thing they signed off. So the comparison
is line-oriented and bounded, and it says when it truncated rather than pretending the
tail is identical.

A revision is written for every act that can change what the entry says, including
confirmation, which changes nothing but the status. Recording confirmation is what makes
"the version you approved" a fact in the table instead of an inference from timestamps.
"""

import difflib
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.knowledge.models import (
    STATUS_CONFIRMED,
    KnowledgeEntry,
    KnowledgeRevision,
)
from app.models import utcnow

# Lines of unchanged text kept on each side of a change. Three is the smallest number
# that still shows which paragraph a hunk belongs to.
CONTEXT_LINES = 3
# A definition nobody will read to the end produces a diff nobody will read to the end.
# Hitting this sets `truncated`, which the UI states rather than hides.
MAX_DIFF_LINES = 400
# Its own op, never a styled `equal` line: a reader must not mistake an elided run for a
# paragraph that is literally an ellipsis in the entry.
GAP = "\u2026"


def revisions(session: Session, knowledge_id: int) -> list[KnowledgeRevision]:
    """Every snapshot of one entry, oldest first."""
    return (
        session.query(KnowledgeRevision)
        .filter(KnowledgeRevision.knowledge_id == knowledge_id)
        .order_by(KnowledgeRevision.version)
        .all()
    )


def latest_confirmed(rows: list[KnowledgeRevision]) -> KnowledgeRevision | None:
    """The newest snapshot that was taken at a confirmation, or None."""
    for row in reversed(rows):
        if row.status == STATUS_CONFIRMED:
            return row
    return None


def record(
    session: Session,
    entry: KnowledgeEntry,
    *,
    reason: str,
    now: datetime | None = None,
) -> KnowledgeRevision:
    """Snapshot the entry as it stands. Call it inside the transaction that changed it.

    The version is read and written in the same transaction, so a second writer racing
    this one fails on the unique constraint instead of silently overwriting a version
    number. That is the right failure: this app has one writer, and an error on the
    second one is a bug being reported rather than a note being lost.
    """
    highest = (
        session.query(func.max(KnowledgeRevision.version))
        .filter(KnowledgeRevision.knowledge_id == entry.id)
        .scalar()
    )
    revision = KnowledgeRevision(
        knowledge_id=entry.id,
        version=(highest or 0) + 1,
        title=entry.title,
        body=entry.body,
        kind=entry.kind,
        concept_key=entry.concept_key or "",
        status=entry.status,
        reason=reason,
        created_at=now or utcnow(),
    )
    session.add(revision)
    return revision


def diff_lines(
    before: str,
    after: str,
    *,
    context: int = CONTEXT_LINES,
    limit: int = MAX_DIFF_LINES,
) -> tuple[list[dict], bool]:
    """Line diff as [{"op": equal|delete|insert|gap, "text": ...}], plus a truncation flag."""
    old = before.splitlines()
    new = after.splitlines()
    opcodes = difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes()

    lines: list[dict] = []
    truncated = False

    def emit(op: str, text: str) -> None:
        nonlocal truncated
        if len(lines) >= limit:
            truncated = True
            return
        lines.append({"op": op, "text": text})

    for index, (tag, i1, i2, j1, j2) in enumerate(opcodes):
        if tag == "equal":
            block = old[i1:i2]
            first = index == 0
            last = index == len(opcodes) - 1
            if len(block) <= context * 2 + 1:
                for text in block:
                    emit("equal", text)
            elif first and last:
                # Nothing changed at all: show both ends so the reader can see the entry
                # is the same one, and elide only the middle.
                for text in block[:context]:
                    emit("equal", text)
                emit("gap", GAP)
                for text in block[-context:]:
                    emit("equal", text)
            elif first:
                emit("gap", GAP)
                for text in block[-context:]:
                    emit("equal", text)
            elif last:
                for text in block[:context]:
                    emit("equal", text)
                emit("gap", GAP)
            else:
                for text in block[:context]:
                    emit("equal", text)
                emit("gap", GAP)
                for text in block[-context:]:
                    emit("equal", text)
            continue
        if tag in ("delete", "replace"):
            for text in old[i1:i2]:
                emit("delete", text)
        if tag in ("insert", "replace"):
            for text in new[j1:j2]:
                emit("insert", text)

    return lines, truncated
