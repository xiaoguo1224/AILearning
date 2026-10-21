"""Project-scoped source retrieval for free exploration.

The retriever is deliberately narrow: only chunks that belong to the current project,
never the whole library. A citation is a promise that this project's material said
something, and widening the search would break that promise quietly.
"""

import re
from dataclasses import dataclass

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.resources.service import search_resources_fts

MAX_SOURCES = 5
MAX_CHUNK_CHARS = 1_200
MAX_CONTEXT_CHARS = 6_000
MIN_TERM_CHARS = 2
MAX_FALLBACK_TERMS = 3


@dataclass(frozen=True)
class Source:
    marker: str
    chunk_id: int
    resource_id: int
    filename: str
    locator: str
    text: str


ELLIPSIS = " …"


def _clip(text_value: str, limit: int) -> str:
    """Clip to AT MOST `limit` characters, ellipsis included.

    The ellipsis counts against the limit rather than being appended past it. Two
    characters is exactly the kind of detail that makes a budget overrun by two
    characters per source, and the budget is the only thing standing between a long
    document and a prompt the model cannot accept.
    """
    if len(text_value) <= limit:
        return text_value
    if limit <= len(ELLIPSIS):
        return text_value[:limit]
    return text_value[: limit - len(ELLIPSIS)].rstrip() + ELLIPSIS


def _terms(query: str) -> list[str]:
    """Query words, with punctuation removed.

    "Explain broadcasting." has to be able to find a chunk containing "Broadcasting".
    Splitting on whitespace alone leaves the full stop attached, and a LIKE
    '%broadcasting.%' matches nothing — which is how a perfectly good question ends up
    with no sources and an answer that says the project material does not cover it.
    """
    words = [re.sub(r"[^\w\u4e00-\u9fff]", "", word) for word in re.split(r"\s+", query.strip())]
    return [word for word in words if len(word) >= MIN_TERM_CHARS][:MAX_FALLBACK_TERMS]


def _like_fallback(session: Session, project_id: int, query: str) -> list[tuple[int, int, str, str, str]]:
    """FTS5 tokenisation is word-based; a Chinese phrase can miss entirely.

    The fallback is a bounded LIKE over this project's chunks rather than a second
    index: it is slower, so it only runs when FTS returned nothing, and it is capped.
    """
    terms = _terms(query)
    if not terms:
        return []
    clauses = " OR ".join("c.text LIKE :term" + str(index) for index in range(len(terms)))
    params = {f"term{index}": f"%{term}%" for index, term in enumerate(terms)}
    params["pid"] = project_id
    params["limit"] = MAX_SOURCES
    rows = session.execute(
        text(
            f"""
            SELECT c.id, r.id, r.filename, c.locator, c.text
            FROM resource_chunks c
            JOIN resources r ON r.id = c.resource_id
            JOIN project_resources pr ON pr.resource_id = r.id
            WHERE pr.project_id = :pid AND ({clauses})
            ORDER BY c.id
            LIMIT :limit
            """
        ),
        params,
    ).fetchall()
    return [(row[0], row[1], row[2], row[3], row[4]) for row in rows]


def retrieve(session: Session, project_id: int, query: str) -> list[Source]:
    """Return at most MAX_SOURCES sources, in retrieval order, marked S1..Sn."""
    hits = search_resources_fts(session, query, project_id=project_id, limit=MAX_SOURCES)
    rows: list[tuple[int, int, str, str, str]] = []
    seen: set[int] = set()
    if hits:
        chunk_ids = []
        for hit in hits:
            chunk_id = int(hit["chunk_id"])
            if chunk_id not in seen:
                seen.add(chunk_id)
                chunk_ids.append(chunk_id)
        if chunk_ids:
            found = session.execute(
                text(
                    """
                    SELECT c.id, r.id, r.filename, c.locator, c.text
                    FROM resource_chunks c
                    JOIN resources r ON r.id = c.resource_id
                    JOIN project_resources pr ON pr.resource_id = r.id
                    WHERE pr.project_id = :pid AND c.id IN :ids
                    """
                ).bindparams(bindparam("ids", expanding=True)),
                {"pid": project_id, "ids": chunk_ids},
            ).fetchall()
            by_id = {row[0]: row for row in found}
            rows = [by_id[cid] for cid in chunk_ids if cid in by_id]
    if not rows:
        rows = _like_fallback(session, project_id, query)

    sources: list[Source] = []
    budget = MAX_CONTEXT_CHARS
    for index, (chunk_id, resource_id, filename, locator, body) in enumerate(rows, start=1):
        if budget <= 0 or len(sources) >= MAX_SOURCES:
            break
        excerpt = _clip(body or "", min(MAX_CHUNK_CHARS, budget))
        if not excerpt:
            continue
        budget -= len(excerpt)
        sources.append(
            Source(
                marker=f"S{len(sources) + 1}",
                chunk_id=chunk_id,
                resource_id=resource_id,
                filename=filename,
                locator=locator or "",
                text=excerpt,
            )
        )
    return sources
