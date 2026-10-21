"""Staged course generation: outline review before content generation."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import generation as gen
from app.db import get_session as get_db
from app.jobs import service as jobs
from app.llm import get_provider
from app.metering import MeteredLLM
from app.staged_gen import service
from app.staged_gen.schemas import GenerationInput, ReviewInput

router = APIRouter(prefix="/api/courses", tags=["staged-generation"])


class OutlineGenerateInput(BaseModel):
    topic: str
    sources: list[dict] | None = None  # [{type: "text"|"url", content: str}]
    feedback: str | None = None
    difficulty: int | None = None  # 0=低, 1=中, 2=高


class OutlineReviseInput(BaseModel):
    outline: dict
    feedback: str
    topic: str | None = None


@router.post("/outline/generate")
def generate_outline_endpoint(body: OutlineGenerateInput):
    """Generate a course outline for review. Does not create a course."""
    if not body.topic.strip() and not body.sources:
        raise HTTPException(422, "Provide a topic or sources.")
    run_id = uuid.uuid4().hex
    meter = MeteredLLM(get_provider(), run_id)
    chunks = []
    owners = []
    _difficulty = body.difficulty if body.difficulty in (0, 1, 2) else 1
    _difficulty_desc = {
        0: "课程难度：入门级。要求提纲精简，章节数量适中，每个章节聚焦基础概念。",
        1: "课程难度：中等。要求提纲全面，覆盖主要知识点。",
        2: "课程难度：高级。要求提纲深入详细，章节划分细致，包含进阶内容。",
    }[_difficulty]
    chunks.append(_difficulty_desc)
    owners.append("difficulty")
    if body.topic.strip():
        chunks.append(f"Topic: {body.topic.strip()}")
        owners.append("topic")
    for i, s in enumerate(body.sources or []):
        content = s.get("content", "")
        if content:
            chunks.append(content[:8000])
            owners.append(s.get("type", f"source-{i}"))
    try:
        outline = gen.generate_outline(meter, chunks, owners=owners, feedback=body.feedback)
        return {"outline": outline}
    except Exception as exc:
        raise HTTPException(500, f"Outline generation failed: {str(exc)[:200]}")


@router.post("/outline/revise")
def revise_outline_endpoint(body: OutlineReviseInput):
    """Revise an outline based on user feedback."""
    if not body.feedback.strip():
        raise HTTPException(422, "Provide feedback for revision.")
    run_id = uuid.uuid4().hex
    meter = MeteredLLM(get_provider(), run_id)
    # Reconstruct chunks from the outline for revision context.
    chunks = [f"Current outline:\n{body.outline}"]
    if body.topic:
        chunks.append(f"Topic: {body.topic}")
    try:
        outline = gen.generate_outline(meter, chunks, owners=["outline"], feedback=body.feedback)
        return {"outline": outline}
    except Exception as exc:
        raise HTTPException(500, f"Outline revision failed: {str(exc)[:200]}")


@router.post("/generation/job", status_code=202)
def start_generation(body: GenerationInput, db: Session = Depends(get_db)):
    job = service.create(db, body)
    return {"job_id": job.id}


@router.post("/generation/{job_id}/review", status_code=202)
def review_generation(job_id: str, body: ReviewInput, db: Session = Depends(get_db)):
    service.review(db, job_id, body)
    return {"job_id": job_id}


@router.post("/generation/{job_id}/retry", status_code=202)
def retry_generation(job_id: str, db: Session = Depends(get_db)):
    job = service.locked_job(db, job_id)
    if job.status != "failed":
        raise HTTPException(409, "Only failed tasks can be retried.")
    job.status, job.error = "pending", None
    db.commit()
    jobs.append_trace(job_id, {"type": "thinking", "content": "用户重试未完成的生成步骤。"})
    jobs.run_in_background(job_id, service.run)
    return {"job_id": job_id}
