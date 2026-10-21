"""Service layer for Resource storage, ingestion, and search."""

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


def search_resources_fts(
    session: Session, query: str, project_id: int | None = None, limit: int = 20
) -> list[dict]:
    # Clean FTS query: strip special sqlite fts operators to avoid syntax error
    safe_terms = [re.sub(r"[^\w\u4e00-\u9fff]", "", t) for t in query.split()]
    safe_terms = [t for t in safe_terms if t]
    if not safe_terms:
        return []

    fts_query_str = " ".join(f'"{t}"' for t in safe_terms)

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
        results = session.execute(
            sql, {"query": fts_query_str, "pid": project_id, "limit": limit}
        ).fetchall()
    else:
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
        results = session.execute(sql, {"query": fts_query_str, "limit": limit}).fetchall()

    return [
        {
            "chunk_id": row.chunk_id,
            "resource_id": row.resource_id,
            "filename": row.filename,
            "kind": row.kind,
            "locator": row.locator,
            "snippet": row.snippet,
        }
        for row in results
    ]
