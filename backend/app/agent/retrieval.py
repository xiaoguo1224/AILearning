"""Project-scoped source retrieval for free exploration.

The retriever is deliberately narrow: only material that belongs to the current
project, never the whole library. That is the project's uploaded resources plus
the lessons of every course linked to the project — a project is an aggregation
of courses, so asking at project level sees all of them. A citation is a promise
that this project's material said something, and widening the search beyond the
project would break that promise quietly.
"""

import re
from dataclasses import dataclass

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.resources.service import cjk_bigrams, search_resources_fts

MAX_SOURCES = 5
MAX_CHUNK_CHARS = 1_200
MAX_CONTEXT_CHARS = 6_000
MIN_TERM_CHARS = 2
MAX_FALLBACK_TERMS = 3
# Only for ranking merged candidates, never for the WHERE clause: "what"/"是"
# match everything and would drown the real keywords.
_RANK_STOPWORDS = frozenset(
    "what which who whom whose when where why how is are was were be been being "
    "do does did have has had the a an of to in on for and or as at by with from "
    "that this it its 是 的 了 在 和 与 或 什么 怎么 为什么 如何 吗 呢".split()
)
# An unbroken CJK run this long is a sentence/question, not a keyword: FTS5 and
# LIKE have no Chinese word segmentation, so searching it verbatim matches
# nothing. Splitting it into overlapping bigrams approximates keyword search.
CJK_RUN_BIGRAM_MIN = 4
MAX_EXPANDED_TERMS = 12


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


def _expand_word(word: str) -> list[str]:
    """Split a sanitized word's long CJK runs into bigrams; keep the rest.

    "为什么矩阵乘法里面用星号会报错" becomes 矩阵/阵乘/乘法/… bigrams so the
    LIKE fallback can find the chunk about 矩阵乘法 and 星号. Short runs and
    non-CJK words are kept verbatim to preserve keyword precision.
    """
    parts = re.split(r"([\u4e00-\u9fff]+)", word)
    out: list[str] = []
    for part in parts:
        if not part:
            continue
        if "\u4e00" <= part[0] <= "\u9fff" and len(part) >= CJK_RUN_BIGRAM_MIN:
            out.extend(cjk_bigrams(part))
        elif len(part) >= MIN_TERM_CHARS:
            out.append(part)
    return out or [word]


def _terms(query: str) -> list[str]:
    """Query words, with punctuation removed.

    "Explain broadcasting." has to be able to find a chunk containing "Broadcasting".
    Splitting on whitespace alone leaves the full stop attached, and a LIKE
    '%broadcasting.%' matches nothing — which is how a perfectly good question ends up
    with no sources and an answer that says the project material does not cover it.

    A long unbroken Chinese question has no whitespace at all; it is expanded
    into character bigrams (see _expand_word) so it degrades to keyword search
    instead of one unmatchable verbatim phrase.
    """
    words = [re.sub(r"[^\w\u4e00-\u9fff]", "", word) for word in re.split(r"\s+", query.strip())]
    words = [word for word in words if len(word) >= MIN_TERM_CHARS][:MAX_FALLBACK_TERMS]
    terms: list[str] = []
    for word in words:
        terms.extend(_expand_word(word))
    seen: set[str] = set()
    deduped = [term for term in terms if not (term in seen or seen.add(term))]
    return deduped[:MAX_EXPANDED_TERMS]


def _like_fallback(
    session: Session, project_id: int, query: str
) -> list[tuple[int, int, str, str, str]]:
    """FTS5 tokenisation is word-based; a Chinese phrase can miss entirely.

    The fallback is a bounded LIKE over this project's chunks rather than a second
    index: it is slower, so it only runs when FTS returned nothing, and it is capped.
    Rows are ranked by how many terms they match, so a bigram-OR query still
    surfaces the chunk sharing the most vocabulary with the question first.
    """
    terms = _terms(query)
    if not terms:
        return []
    clauses = " OR ".join("c.text LIKE :term" + str(index) for index in range(len(terms)))
    score = " + ".join(
        f"(CASE WHEN c.text LIKE :term{index} THEN 1 ELSE 0 END)" for index in range(len(terms))
    )
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
            ORDER BY ({score}) DESC, c.id
            LIMIT :limit
            """
        ),
        params,
    ).fetchall()
    return [(row[0], row[1], row[2], row[3], row[4]) for row in rows]


def _lesson_hits(
    session: Session, project_id: int, query: str
) -> list[tuple[int, str, str, str]]:
    """Lessons of the project's linked courses matching the query.

    A project aggregates courses (project_courses), so project-level questions
    see every course, not just uploaded resources. Returns
    (lesson_id, course_title, lesson_title, content); callers rank these against
    resource chunks by shared vocabulary.
    """
    terms = _terms(query)
    if not terms:
        return []
    clauses = " OR ".join(
        f"(l.title LIKE :term{index} OR l.content LIKE :term{index})"
        for index in range(len(terms))
    )
    score = " + ".join(
        f"(CASE WHEN l.title LIKE :term{index} OR l.content LIKE :term{index} "
        f"THEN 1 ELSE 0 END)"
        for index in range(len(terms))
    )
    params = {f"term{index}": f"%{term}%" for index, term in enumerate(terms)}
    params["pid"] = project_id
    params["limit"] = MAX_SOURCES
    rows = session.execute(
        text(
            f"""
            SELECT l.id, c.title, l.title, l.content
            FROM lessons l
            JOIN modules m ON m.id = l.module_id
            JOIN courses c ON c.id = m.course_id
            JOIN project_courses pc ON pc.course_id = c.id
            WHERE pc.project_id = :pid AND ({clauses})
            ORDER BY ({score}) DESC, l.id
            LIMIT :limit
            """
        ),
        params,
    ).fetchall()
    return [(row[0], row[1], row[2], row[3] or "") for row in rows]


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

    # Rank resource chunks and course lessons by shared vocabulary, then take the
    # best of both. Lessons carry (lesson_id, course_title, lesson_title); they
    # ride resource_id 0 so a reader can tell a course citation from an upload.
    terms = _terms(query)

    def _score(text_value: str) -> int:
        lowered = (text_value or "").lower()
        return sum(
            1
            for term in terms
            if term.lower() not in _RANK_STOPWORDS and term.lower() in lowered
        )

    candidates: list[tuple[int, str, int, int, str, str, str]] = [
        (_score(body), "resource", chunk_id, resource_id, filename, locator or "", body or "")
        for chunk_id, resource_id, filename, locator, body in rows
    ]
    candidates += [
        (
            _score(f"{lesson_title} {content}"),
            "lesson",
            lesson_id,
            0,
            course_title,
            lesson_title,
            content,
        )
        for lesson_id, course_title, lesson_title, content in _lesson_hits(
            session, project_id, query
        )
    ]
    # Python's sort is stable: equal scores keep resource-then-lesson order, and
    # the pre-existing resource order inside each group.
    candidates.sort(key=lambda candidate: -candidate[0])

    sources: list[Source] = []
    budget = MAX_CONTEXT_CHARS
    for _, kind, chunk_id, resource_id, filename, locator, body in candidates:
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
                locator=locator,
                text=excerpt,
            )
        )
    return sources
