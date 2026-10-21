"""Project learning-graph API: AI extraction as background job + edge listing."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session as get_db
from app.jobs import service as jobs
from app.project_graph import service as graph_service

router = APIRouter(prefix="/api/projects/{project_id}/graph", tags=["project-graph"])


class EdgeOut(BaseModel):
    id: int
    from_type: str
    from_id: int
    to_type: str
    to_id: int
    kind: str
    reason: str


class GraphOut(BaseModel):
    edges: list[EdgeOut]
    positions: dict[str, dict]


@router.get("", response_model=GraphOut)
def get_graph(project_id: int, db: Session = Depends(get_db)):
    edges = graph_service.list_edges(db, project_id)
    positions = graph_service.get_positions(db, project_id)
    return GraphOut(
        edges=[
            EdgeOut(
                id=e.id,
                from_type=e.from_type,
                from_id=e.from_id,
                to_type=e.to_type,
                to_id=e.to_id,
                kind=e.kind,
                reason=e.reason,
            )
            for e in edges
        ],
        positions=positions,
    )


def _course_payload(db: Session, project_id: int) -> list[dict]:
    """Build the course/chapter payload the extractor needs."""
    from app.projects.models import Project

    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    courses = []
    for pc in project.courses:
        course = pc.course
        if not course:
            continue
        modules = []
        for mod in course.modules:
            lessons = []
            for les in mod.lessons:
                lessons.append(
                    {
                        "id": les.id,
                        "title": les.title,
                        "summary": (les.content or "")[:300],
                    }
                )
            modules.append({"id": mod.id, "title": mod.title, "lessons": lessons})
        courses.append({"id": course.id, "title": course.title, "modules": modules})
    return courses


def _run_extraction(job_id: str, project_id: int):
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        courses = _course_payload(db, project_id)
        jobs.append_trace(job_id, {
            "type": "thinking",
            "content": f"开始分析项目 {project_id} 的课程关系，共 {len(courses)} 门课程",
        })
        jobs.update_progress(job_id, {"stage": "extracting", "courses": len(courses)})
        jobs.append_trace(job_id, {
            "type": "tool_call",
            "tool": "extract_relationships",
            "input": {"project_id": project_id, "course_count": len(courses)},
        })
        result = graph_service.extract_relationships(db, project_id, courses)
        edges = result["edges"] if isinstance(result, dict) else result
        jobs.append_trace(job_id, {
            "type": "tool_result",
            "tool": "extract_relationships",
            "output": {"edge_count": len(edges)},
        })
        jobs.append_trace(job_id, {
            "type": "thinking",
            "content": f"提取完成，共 {len(edges)} 条关系边",
        })
        jobs.complete_job(job_id, {"project_id": project_id, "edges": len(edges)})
    except Exception as exc:  # noqa: BLE001
        jobs.append_trace(job_id, {
            "type": "thinking",
            "content": f"提取失败：{str(exc)[:200]}",
        })
        jobs.fail_job(job_id, str(exc)[:500])
    finally:
        db.close()


@router.post("/extract/job", status_code=202)
def extract_graph_job(project_id: int, db: Session = Depends(get_db)):
    from app.projects.models import Project

    if not db.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    # Prevent duplicate: return existing running job if any.
    existing = (
        db.query(jobs.Job)
        .filter(
            jobs.Job.type == "project_graph_extract",
            jobs.Job.ref_id == project_id,
            jobs.Job.status.in_(["pending", "running"]),
        )
        .order_by(jobs.Job.created_at.desc())
        .first()
    )
    if existing:
        return {"job_id": existing.id, "resumed": True}
    job = jobs.create_job(
        db,
        job_type="project_graph_extract",
        ref_type="project",
        ref_id=project_id,
    )
    def _run(jid: str):
        _run_extraction(jid, project_id)
    jobs.run_in_background(job.id, _run)
    return {"job_id": job.id}
