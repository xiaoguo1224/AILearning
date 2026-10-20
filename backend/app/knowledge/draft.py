"""Turning one grounded answer into a knowledge draft, and noticing when it is a repeat.

TWO DECISIONS WORTH ARGUING WITH.

NO MODEL CALL. A draft is assembled from the answer that was already written and already
paid for: the question becomes the title, the grounded half of the reply becomes the body,
and the citation snapshot becomes the provenance. Distilling it into prettier prose would
mean a second metered call on every question, charged to a learner who asked for an answer
and not for a note. Extraction also cannot invent a claim, which matters more here than
style: a note is the one place in this app where text is kept for later rereading rather
than read once.

ONLY THE GROUNDED HALF. An answer has two registers and only one of them is about this
project's material. A note is where "we checked this" is implied by the fact that it was
kept at all, so promoting the ungrounded half would launder general knowledge into project
knowledge — the exact confusion the two-field reply schema exists to prevent. An answer
with no citations is therefore refused, with a sentence saying why, and a learner who
genuinely wants to keep one can write the note themselves, which is a deliberate act whose
provenance says so.

WHAT "DEDUPLICATION" MEANS HERE. It is not a merge and it never touches an existing entry.
A near-duplicate is reported as a candidate and the write either lands as a new draft or
returns the entry it duplicated; a confirmed entry in particular is never rewritten,
because a draft generated from today's answer is not evidence about a definition somebody
already settled.
"""

import difflib
import re

from sqlalchemy.orm import Session

from app.agent.models import AgentMessage, AgentSession
from app.concepts import normalize_concept
from app.knowledge import history
from app.knowledge.models import (
    KIND_NOTE,
    REASON_CREATED,
    SOURCE_EXPLORATION,
    KnowledgeEntry,
    ProjectKnowledge,
)
from app.knowledge.service import MAX_BODY_CHARS, MAX_TITLE_CHARS
from app.models import utcnow
from app.projects.service import project_error, writable_project

MAX_CANDIDATES = 5
# Below this, two titles are different subjects that happen to share words. Above it, they
# are the same subject said twice, and a learner would rather be told than find out later.
SIMILAR_TITLE_RATIO = 0.72
MAX_QUESTION_CHARS = 120


def _one_line(value: str, limit: int) -> str:
    collapsed = re.sub(r"\s+", " ", value).strip()
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "…"


def _preceding_question(session: Session, message: AgentMessage) -> str:
    """The learner's question this reply answered, or "" when there is none.

    Walks back rather than trusting an adjacency: a practice set writes an assistant
    message with no new question, and the question it was built from may be several turns
    earlier.
    """
    rows = (
        session.query(AgentMessage)
        .filter(
            AgentMessage.session_id == message.session_id,
            AgentMessage.role == "user",
            AgentMessage.id < message.id,
        )
        .order_by(AgentMessage.id.desc())
        .limit(1)
        .all()
    )
    return rows[0].body if rows else ""


def title_for(session: Session, message: AgentMessage) -> str:
    question = _preceding_question(session, message)
    if question:
        return _one_line(question, MAX_QUESTION_CHARS)
    # No question in front of it: fall back to the first line of the answer, which is at
    # least what the note is about.
    first_line = message.body.strip().splitlines()[0] if message.body.strip() else ""
    return _one_line(first_line, MAX_QUESTION_CHARS) or "Untitled note"


def body_for(message: AgentMessage) -> str:
    return message.body.strip()[:MAX_BODY_CHARS]


def provenance_for(session: Session, message: AgentMessage, question: str) -> list[dict]:
    """One item per cited source, plus one naming the conversation itself.

    The conversation item is what makes the note traceable back to the turn it came from;
    the source items are what a reader can open.
    """
    items: list[dict] = [
        {
            "kind": SOURCE_EXPLORATION,
            "session_id": message.session_id,
            "message_id": message.id,
            "question": _one_line(question, 200) if question else None,
        }
    ]
    for ref in message.source_refs or []:
        if not isinstance(ref, dict):
            continue
        items.append(
            {
                "kind": "resource",
                "resource_id": ref.get("resource_id"),
                "chunk_id": ref.get("chunk_id"),
                "filename": ref.get("filename"),
                "locator": ref.get("locator"),
            }
        )
    return items


def _project_entries(session: Session, project_id: int) -> list[KnowledgeEntry]:
    return (
        session.query(KnowledgeEntry)
        .join(ProjectKnowledge, ProjectKnowledge.knowledge_id == KnowledgeEntry.id)
        .filter(ProjectKnowledge.project_id == project_id)
        .all()
    )


def candidates(
    session: Session,
    project_id: int,
    *,
    title: str,
    concept_key: str = "",
    limit: int = MAX_CANDIDATES,
) -> list[dict]:
    """Entries this one would sit next to, most similar first.

    Reported, never merged. The score is deliberately crude — an exact normalized title,
    then a shared concept key, then character similarity — because the alternative is a
    model call to decide whether two notes are the same, and being wrong about that
    silently is worse than being crude out loud.
    """
    wanted_title = _one_line(title, MAX_TITLE_CHARS)
    wanted_key = normalize_concept(concept_key)
    scored: list[tuple[float, KnowledgeEntry]] = []
    for entry in _project_entries(session, project_id):
        if _one_line(entry.title, MAX_TITLE_CHARS).casefold() == wanted_title.casefold():
            scored.append((1.0, entry))
            continue
        if wanted_key and entry.concept_key and entry.concept_key == wanted_key:
            scored.append((0.9, entry))
            continue
        ratio = difflib.SequenceMatcher(None, entry.title.casefold(), wanted_title.casefold()).ratio()
        if ratio >= SIMILAR_TITLE_RATIO:
            scored.append((round(ratio, 3), entry))

    scored.sort(key=lambda item: (-item[0], item[1].id))
    return [
        {
            "id": entry.id,
            "title": entry.title,
            "status": entry.status,
            "kind": entry.kind,
            "score": score,
        }
        for score, entry in scored[:limit]
    ]


def draft_from_message(
    session: Session, project_id: int, *, session_id: int, message_id: int
) -> tuple[KnowledgeEntry | None, int | None, list[dict]]:
    """Create a draft from one assistant message.

    Returns (created entry, the id of an entry it duplicated, candidates). Exactly one of
    the first two is set: a repeat returns the existing entry instead of writing a second
    copy of the same note, and says which one it was.
    """
    message = session.get(AgentMessage, message_id)
    if message is None or message.session_id != session_id:
        raise project_error(404, "message_not_found", "That message is not in this conversation.")
    conversation = session.get(AgentSession, session_id)
    if conversation is None or conversation.project_id != project_id:
        raise project_error(404, "session_not_found", "Session not found in this project.")
    if message.role != "assistant":
        raise project_error(422, "not_an_answer", "Only an answer can become a note.")
    if not message.grounded:
        raise project_error(
            422,
            "not_grounded",
            "This answer does not cite the project's material, so there is nothing to keep. "
            "Write the note yourself if you want it anyway.",
        )
    # Checked after the message is known to be real and usable, so an archived project
    # reports the archive rather than a confusing "no citations". Checked before the
    # duplicate scan, because a duplicate is still an answer about this project and the
    # archive is what actually decides.
    writable_project(session, project_id)

    question = _preceding_question(session, message)
    title = title_for(session, message)
    found = candidates(session, project_id, title=title)

    duplicate = next((item for item in found if item["score"] == 1.0), None)
    if duplicate is not None:
        return None, duplicate["id"], found

    entry = KnowledgeEntry(
        project_id=project_id,
        title=title,
        body=body_for(message),
        kind=KIND_NOTE,
        status="draft",
        concept_key="",
        source_kind=SOURCE_EXPLORATION,
        provenance=provenance_for(session, message, question),
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    session.add(entry)
    session.flush()
    # A promoted answer starts its history here, so the first edit has something to be
    # compared against. Nothing else about the draft differs from a hand-written note.
    history.record(session, entry, reason=REASON_CREATED)
    session.add(ProjectKnowledge(project_id=project_id, knowledge_id=entry.id))
    session.commit()
    session.refresh(entry)
    return entry, None, found
