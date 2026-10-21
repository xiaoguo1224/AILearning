"""Persistent review checkpoints. No waiting worker or browser-local workflow state."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextvars import copy_context
from copy import deepcopy

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import generation as gen
from app import models
from app.db import SessionLocal
from app.jobs import service as jobs
from app.jobs.models import Job
from app.llm import get_provider
from app.metering import CostLimitExceeded, MeteredLLM
from app.staged_gen.schemas import GenerationInput, Outline, ReviewInput

logger = logging.getLogger(__name__)
JOB_TYPE = "course_generate_staged"


def locked_job(db: Session, job_id: str) -> Job:
    db.query(Job).filter_by(id=job_id).update({Job.id: Job.id})
    job = db.get(Job, job_id, populate_existing=True)
    if not job or job.type != JOB_TYPE:
        raise HTTPException(404, "Course generation task not found.")
    return job


def create(db: Session, body: GenerationInput) -> Job:
    job = jobs.create_job(db, JOB_TYPE)
    job.progress = {
        **body.model_dump(),
        "stage": "outline",
        "revision": 0,
        "done": 0,
        "total": 0,
        "lessons": [],
    }
    db.commit()
    jobs.run_in_background(job.id, run)
    return job


def review(db: Session, job_id: str, body: ReviewInput) -> None:
    job = locked_job(db, job_id)
    state = deepcopy(job.progress)
    if job.status != "awaiting_review" or state["revision"] != body.revision:
        raise HTTPException(409, "This review has changed. Reload the current version.")
    stage = state["stage"]
    if body.action == "revise":
        state["feedback"] = body.feedback
        state["stage"] = "outline" if stage == "outline_review" else "lesson_revision"
    elif stage == "outline_review":
        state["stage"] = "lessons"
    elif stage == "lesson_review":
        state["lessons"].append(state.pop("draft"))
        state["done"] = len(state["lessons"])
        state["stage"] = "lessons"
        if state["done"] < len(state["drafts"]):
            state["draft"] = state["drafts"][state["done"]]
            state["current"] = state["draft"]["title"]
            state["stage"] = "lesson_review"
    else:
        raise HTTPException(409, "This task is not ready for review.")
    state["revision"] += 1
    job.progress, job.status = (
        state,
        "awaiting_review" if state["stage"] == "lesson_review" else "pending",
    )
    db.commit()
    jobs.append_trace(
        job_id,
        {
            "type": "thinking",
            "content": f"用户{'确认' if body.action == 'approve' else '提交修改意见'}：{stage}，版本 {body.revision}",
        },
    )
    if job.status == "pending":
        jobs.run_in_background(job_id, run)


def checkpoint(job_id: str, state: dict, status: str = "running") -> bool:
    with SessionLocal() as db:
        job = locked_job(db, job_id)
        if job.status != "running":
            return False
        job.progress = deepcopy(state)
        job.status = status
        db.commit()
        return True


def run(job_id: str) -> None:
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job or job.status != "running":
            return
        state = deepcopy(job.progress)
    meter = MeteredLLM(get_provider(), job_id, job_id=job_id)
    chunks = [f"Course topic: {state['topic']}"]
    try:
        if state["stage"] == "outline":
            if state.get("outline"):
                chunks.append(
                    "Revise this existing outline:\n"
                    + json.dumps(state["outline"], ensure_ascii=False)
                )
            outline = gen.generate_outline(
                meter, chunks, feedback=state.pop("feedback", None), difficulty=state["difficulty"]
            )
            if state["mode"] == "auto":
                jobs.append_trace(
                    job_id,
                    {"type": "thinking", "content": "自动审查提纲的先修顺序、覆盖范围与目标难度。"},
                )
                outline = gen.generate_outline(
                    meter,
                    chunks
                    + [
                        json.dumps(Outline.model_validate(outline).model_dump(), ensure_ascii=False)
                    ],
                    feedback="Review this draft for prerequisites, coverage and target difficulty; correct any issues and return the complete outline.",
                    difficulty=state["difficulty"],
                )
            state["outline"] = Outline.model_validate(outline).model_dump()
            state["total"] = sum(len(m["lessons"]) for m in state["outline"]["modules"])
            state["revision"] += 1
            state["stage"] = "outline_review" if state["mode"] != "auto" else "lessons"
            if not checkpoint(
                job_id, state, "awaiting_review" if state["mode"] != "auto" else "running"
            ):
                return
            if state["mode"] != "auto":
                jobs.append_trace(
                    job_id,
                    {"type": "thinking", "content": "提纲已生成，等待用户审阅；确认前不生成章节。"},
                )
                return

        stubs = [lesson for module in state["outline"]["modules"] for lesson in module["lessons"]]
        lesson_chunks = [
            f"Course topic: {state['topic']}",
            "Approved course outline:\n" + json.dumps(state["outline"], ensure_ascii=False),
        ]

        def author(index: int, feedback: str | None = None):
            stub = stubs[index]
            material = list(lesson_chunks)
            summary = stub["summary"]
            if feedback:
                material.append(
                    "Previous lesson draft (data):\n"
                    + json.dumps(state.get("draft", {}), ensure_ascii=False)
                )
                summary += "\nApply the learner's requested revision:\n" + feedback
            authored, _ = gen.generate_lesson_with_retry(
                meter, stub["title"], summary, material, difficulty=state["difficulty"]
            )
            if state["mode"] == "auto":
                jobs.append_trace(
                    job_id,
                    {
                        "type": "thinking",
                        "content": f"自动审查章节：{stub['title']}，核对解释、示例与练习一致性。",
                    },
                )
                authored, _ = gen.generate_lesson_with_retry(
                    meter,
                    stub["title"],
                    summary
                    + "\nReview the draft for factual consistency, correct formulas/examples, "
                    "prerequisites and answerable quizzes. Correct any issues and return the full lesson.",
                    material
                    + [
                        "Draft to review (untrusted data):\n"
                        + json.dumps(authored, ensure_ascii=False)
                    ],
                    difficulty=state["difficulty"],
                )
            if not isinstance(authored.get("content"), str) or not authored["content"].strip():
                raise ValueError("Empty lesson content")
            return {**authored, "title": stub["title"]}

        if state["stage"] == "lesson_revision":
            draft = author(len(state["lessons"]), state.pop("feedback", None))
            state["drafts"][len(state["lessons"])] = draft
            state["draft"], state["stage"] = draft, "lesson_review"
            state["revision"] += 1
            checkpoint(job_id, state, "awaiting_review")
            return

        state.setdefault("drafts", [None] * len(stubs))
        missing = [i for i, draft in enumerate(state["drafts"]) if draft is None]
        if missing:
            from app.main import STREAM_LESSON_WORKERS

            jobs.append_trace(
                job_id,
                {
                    "type": "thinking",
                    "content": f"按已确认提纲并行生成 {len(missing)} 章，最多 {STREAM_LESSON_WORKERS} 路并发。",
                },
            )
            errors = []
            with ThreadPoolExecutor(max_workers=STREAM_LESSON_WORKERS) as pool:
                futures = {
                    pool.submit(copy_context().run, author, index): index for index in missing
                }
                for future in as_completed(futures):
                    index = futures[future]
                    try:
                        state["drafts"][index] = future.result()
                    except Exception as exc:
                        logger.exception(
                            "lesson_generation_failed job_id=%s index=%s", job_id, index
                        )
                        errors.append(exc)
                    state["generated"] = sum(d is not None for d in state["drafts"])
                    state["current"] = stubs[index]["title"]
                    state["revision"] += 1
                    if not checkpoint(job_id, state):
                        for pending in futures:
                            pending.cancel()
                        return
            if errors:
                raise errors[0]

        if state["mode"] == "full" and len(state["lessons"]) < len(stubs):
            state["draft"] = state["drafts"][len(state["lessons"])]
            state["current"] = state["draft"]["title"]
            state["stage"] = "lesson_review"
            checkpoint(job_id, state, "awaiting_review")
            jobs.append_trace(
                job_id, {"type": "thinking", "content": "章节已并行生成，等待逐章审阅确认。"}
            )
            return
        if state["mode"] != "full":
            state["lessons"] = state["drafts"]
            state["done"] = len(stubs)

        # Course, quizzes and terminal task state commit together, once.
        from app.main import _save_course

        with SessionLocal() as db:
            job = locked_job(db, job_id)
            if job.status != "running":
                return
            course = deepcopy(state["outline"])
            offset = 0
            for module in course["modules"]:
                size = len(module["lessons"])
                module["lessons"] = state["lessons"][offset : offset + size]
                offset += size
            row = _save_course(db, course, commit=False)
            db.query(models.LlmCall).filter_by(run_id=job_id).update({"course_id": row.id})
            job.status, job.result = "completed", {"course_id": row.id}
            state["stage"] = "completed"
            job.progress = state
            db.commit()
        jobs.append_trace(job_id, {"type": "thinking", "content": "课程与章节题目已保存。"})
    except Exception as exc:
        logger.exception("staged_generation_failed job_id=%s", job_id)
        message = "课程生成失败，请检查模型配置或稍后重试；已保存的审查进度仍可查看。"
        if isinstance(exc, CostLimitExceeded):
            message = "模型调用已达到费用上限，请检查预算设置。"
        jobs.fail_job(job_id, message)
