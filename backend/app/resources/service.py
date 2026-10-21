"""Service layer for Resource storage, ingestion, and search."""

import itertools
import os
import re
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.resources.models import Resource, ResourceChunk
from app.resources.parser import (
    ParsedChunk,
)

DATA_DIR = Path(os.environ.get("STUDYFORGE_DATA_DIR", "data/resources")).resolve()


def ensure_storage_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def get_resource_file_path(sha256_hash: str, ext: str) -> Path:
    storage_dir = ensure_storage_dir()
    safe_ext = re.sub(r"[^a-zA-Z0-9_.-]", "", ext)
    return storage_dir / f"{sha256_hash}{safe_ext}"


def init_fts(session: Session) -> None:
    """Create standalone FTS5 virtual table for resource chunks if not exists."""
    session.execute(
        text(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS resource_chunks_fts USING fts5(
                chunk_id UNINDEXED,
                resource_id UNINDEXED,
                text
            );
            """
        )
    )
    session.commit()

def sync_fts_chunk(session: Session, chunk_id: int, resource_id: int, text_content: str) -> None:
    session.execute(
        text(
            "INSERT INTO resource_chunks_fts(chunk_id, resource_id, text) VALUES (:cid, :rid, :txt)"
        ),
        {"cid": chunk_id, "rid": resource_id, "txt": text_content},
    )


def remove_fts_resource(session: Session, resource_id: int) -> None:
    session.execute(
        text("DELETE FROM resource_chunks_fts WHERE resource_id = :rid"),
        {"rid": resource_id},
    )


def save_chunks_and_sync_fts(
    session: Session, resource: Resource, parsed_chunks: list[ParsedChunk]
) -> None:
    # First remove any existing chunks for this resource
    session.query(ResourceChunk).filter_by(resource_id=resource.id).delete()
    remove_fts_resource(session, resource.id)

    for c in parsed_chunks:
        chunk_row = ResourceChunk(
            resource_id=resource.id,
            ordinal=c.ordinal,
            locator=c.locator,
            text=c.text,
        )
        session.add(chunk_row)
        session.flush()  # to obtain chunk_row.id
        sync_fts_chunk(session, chunk_row.id, resource.id, c.text)


CJK_RE = re.compile(r"[\u4e00-\u9fff]")
CJK_BIGRAM_MIN_RUN = 4
MAX_CJK_TERMS = 12


def cjk_bigrams(run: str) -> list[str]:
    """Overlapping character bigrams of a CJK run, deduplicated, order kept.

    FTS5's unicode61 tokenizer emits each maximal CJK run as a single token and
    LIKE has no word segmentation, so bigrams are the dependency-free way to
    approximate Chinese keyword search.
    """
    chars = [ch for ch in run if "\u4e00" <= ch <= "\u9fff"]
    seen: set[str] = set()
    out: list[str] = []
    for first, second in itertools.pairwise(chars):
        bigram = first + second
        if bigram not in seen:
            seen.add(bigram)
            out.append(bigram)
    return out


def expand_cjk_search_terms(query: str, cap: int = MAX_CJK_TERMS) -> list[str]:
    """Split a query into LIKE-matchable terms.

    Whitespace-separated words are kept verbatim; unbroken CJK runs of 4+
    characters are expanded into character bigrams, because a long Chinese
    question quoted verbatim can never match (no whitespace to split on, no
    segmentation in the index).
    """
    words = [re.sub(r"[^\w\u4e00-\u9fff]", "", word) for word in query.split()]
    terms: list[str] = []
    for word in words:
        if not word:
            continue
        for part in re.split(r"([\u4e00-\u9fff]+)", word):
            if not part:
                continue
            # re.split with a capture group yields homogeneous parts: a part is
            # either all-CJK or all-non-CJK, so checking the first char suffices.
            if "\u4e00" <= part[0] <= "\u9fff" and len(part) >= CJK_BIGRAM_MIN_RUN:
                terms.extend(cjk_bigrams(part))
            elif len(part) >= 2:
                terms.append(part)
    seen: set[str] = set()
    deduped = [term for term in terms if not (term in seen or seen.add(term))]
    return deduped[:cap]


def _like_search(session: Session, query: str, project_id: int | None, limit: int) -> list[dict]:
    """Ranked LIKE fallback for queries FTS cannot serve (chiefly Chinese).

    Only used when the FTS phrase query returned nothing. Rows are ordered by
    how many terms they match, so a bigram-OR query still surfaces the chunk
    sharing the most vocabulary with the question first.
    """
    terms = expand_cjk_search_terms(query)
    if not terms:
        return []
    like = " OR ".join(f"c.text LIKE :term{index}" for index in range(len(terms)))
    score = " + ".join(
        f"(CASE WHEN c.text LIKE :term{index} THEN 1 ELSE 0 END)" for index in range(len(terms))
    )
    params: dict = {f"term{index}": f"%{term}%" for index, term in enumerate(terms)}
    params["limit"] = limit
    if project_id is not None:
        params["pid"] = project_id
        project_join = "JOIN project_resources pr ON pr.resource_id = r.id"
        project_where = "pr.project_id = :pid AND "
    else:
        project_join = ""
        project_where = ""
    rows = session.execute(
        text(
            f"""
            SELECT c.id as chunk_id, r.id as resource_id, r.filename, r.kind,
                   c.locator, c.text as body
            FROM resource_chunks c
            JOIN resources r ON r.id = c.resource_id
            {project_join}
            WHERE {project_where}({like})
            ORDER BY ({score}) DESC, c.id
            LIMIT :limit
            """
        ),
        params,
    ).fetchall()
    return [
        {
            "chunk_id": row.chunk_id,
            "resource_id": row.resource_id,
            "filename": row.filename,
            "kind": row.kind,
            "locator": row.locator,
            "snippet": (row.body or "")[:150],
        }
        for row in rows
    ]


def _run_fts_query(
    session: Session, fts_query_str: str, project_id: int | None, limit: int
) -> list:
    if project_id is not None:
        sql = text(
            """
            SELECT c.id as chunk_id, r.id as resource_id, r.filename, r.kind, c.locator,
                   snippet(resource_chunks_fts, 2, '<b>', '</b>', '...', 15) as snippet
            FROM resource_chunks_fts
            JOIN resource_chunks c ON c.id = resource_chunks_fts.chunk_id
            JOIN resources r ON r.id = c.resource_id
            JOIN project_resources pr ON pr.resource_id = r.id
            WHERE resource_chunks_fts MATCH :query AND pr.project_id = :pid
            ORDER BY rank
            LIMIT :limit
            """
        )
        return session.execute(
            sql, {"query": fts_query_str, "pid": project_id, "limit": limit}
        ).fetchall()
    sql = text(
        """
        SELECT c.id as chunk_id, r.id as resource_id, r.filename, r.kind, c.locator,
               snippet(resource_chunks_fts, 2, '<b>', '</b>', '...', 15) as snippet
        FROM resource_chunks_fts
        JOIN resource_chunks c ON c.id = resource_chunks_fts.chunk_id
        JOIN resources r ON r.id = c.resource_id
        WHERE resource_chunks_fts MATCH :query
        ORDER BY rank
        LIMIT :limit
        """
    )
    return session.execute(sql, {"query": fts_query_str, "limit": limit}).fetchall()


def search_resources_fts(
    session: Session, query: str, project_id: int | None = None, limit: int = 20
) -> list[dict]:
    # Clean FTS query: strip special sqlite fts operators to avoid syntax error
    safe_terms = [re.sub(r"[^\w\u4e00-\u9fff]", "", t) for t in query.split()]
    safe_terms = [t for t in safe_terms if t]
    if not safe_terms:
        return []

    fts_query_str = " ".join(f'"{t}"' for t in safe_terms)
    results = _run_fts_query(session, fts_query_str, project_id, limit)

    if not results and CJK_RE.search(query):
        # FTS5 unicode61 tokenises each maximal CJK run as a single token, so a
        # long Chinese question quoted verbatim can never match; fall back to a
        # ranked LIKE over chunk text instead.
        results = _like_search(session, query, project_id, limit)

    def _field(row, name):
        # FTS results arrive as SQLAlchemy Rows; the LIKE fallback returns dicts.
        return row[name] if isinstance(row, dict) else getattr(row, name)

    return [
        {
            "chunk_id": _field(row, "chunk_id"),
            "resource_id": _field(row, "resource_id"),
            "filename": _field(row, "filename"),
            "kind": _field(row, "kind"),
            "locator": _field(row, "locator"),
            "snippet": _field(row, "snippet"),
        }
        for row in results
    ]
