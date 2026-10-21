"""AI extraction of project learning-graph relationships."""

import json
import uuid

from sqlalchemy.orm import Session

from app.llm import get_provider
from app.metering import MeteredLLM
from app.project_graph.models import ProjectGraphEdge, ProjectGraphLayout

EXTRACT_STAGE = "project_graph_extract"

SYSTEM_PROMPT = """You are analyzing a learning project made of courses.
Given the course titles (and their chapter titles as context), extract ONLY
course-level relationships:

1. COURSE ORDER: the learning sequence between courses. Which course should be
   studied first, based on topic dependencies?
   {"from_type": "course", "from_id": <earlier>, "to_type": "course",
    "to_id": <later>, "kind": "course_sequence", "reason": "<why, Chinese>"}

Also allowed when the dependency is strong:
- "prerequisite": `to` genuinely requires concepts from `from`. Be conservative.
  Both ends must be courses.
- "related": topical overlap worth reviewing together, order flexible.
  Both ends must be courses.

Rules:
- ONLY emit edges where both from_type and to_type are "course".
- Do NOT emit "contains", "chapter_sequence", or any lesson-level edges.
- Every course (except the first to study) should have at least one incoming
  course_sequence or prerequisite edge, forming a coherent learning path.
- Do NOT emit duplicate edges: the same (from, to, kind) triple must appear at
  most once. A->B and B->A are different and both are allowed.
- Do not invent ids. Use only the course ids given.
- Reply with ONLY the JSON array, no other text.

After the edges, on a new line, reply with a second JSON object mapping each
course node to its suggested canvas position for a clear layout:
{"positions": {"course-1": {"x": 100, "y": 200}, ...}}
Place earlier courses to the left, later courses to the right. Use a 1200x800 canvas.
The two JSON values are separated by a line containing only "---".
The two JSON values are separated by a line containing only "---".
"""


def build_prompt(courses: list[dict]) -> str:
    lines = []
    for c in courses:
        lines.append(f"Course {c['id']}: {c['title']}")
        for m in c.get("modules", []):
            for les in m.get("lessons", []):
                summary = (les.get("summary") or "")[:200]
                lines.append(f"  Lesson {les['id']}: {les['title']}" + (f" — {summary}" if summary else ""))
    return "Courses and chapters:\n" + "\n".join(lines) + "\n\nExtract the relationships as a JSON array."


def extract_relationships(
    session: Session,
    project_id: int,
    courses: list[dict],
    job_id: str | None = None,
) -> list[dict]:
    """Run the LLM extraction and persist edges, replacing old ones."""
    if not courses:
        session.query(ProjectGraphEdge).filter_by(project_id=project_id).delete()
        session.commit()
        return []

    run_id = uuid.uuid4().hex
    provider = get_provider()
    # Graph extraction is a long task; allow up to 10 minutes.
    if hasattr(provider, "timeout"):
        provider.timeout = 600
    meter = MeteredLLM(provider, run_id, job_id=job_id)
    prompt = build_prompt(courses)
    raw = meter.generate(EXTRACT_STAGE, SYSTEM_PROMPT, prompt)

    try:
        # Strip markdown fences if the model adds them.
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
        # Split edges and positions on the "---" separator.
        parts = text.strip().split("\n---\n")
        items = json.loads(parts[0].strip())
        positions = {}
        if len(parts) > 1:
            pos_data = json.loads(parts[1].strip())
            positions = pos_data.get("positions", {})
    except (json.JSONDecodeError, IndexError):
        items = []
        positions = {}

    # Validate ids against known courses/lessons.
    valid_courses = {c["id"] for c in courses}
    valid_lessons = {les["id"] for c in courses for m in c.get("modules", []) for les in m.get("lessons", [])}

    def valid(item: dict) -> bool:
        try:
            f_ok = (item["from_type"] == "course" and item["from_id"] in valid_courses) or (
                item["from_type"] == "lesson" and item["from_id"] in valid_lessons
            )
            t_ok = (item["to_type"] == "course" and item["to_id"] in valid_courses) or (
                item["to_type"] == "lesson" and item["to_id"] in valid_lessons
            )
            return f_ok and t_ok and item["kind"] in (
                "contains",
                "course_sequence",
                "chapter_sequence",
                "prerequisite",
                "related",
            )
        except (KeyError, TypeError):
            return False

    edges = [e for e in items if isinstance(e, dict) and valid(e)]

    # Replace old edges atomically.
    session.query(ProjectGraphEdge).filter_by(project_id=project_id).delete()
    for e in edges:
        session.add(
            ProjectGraphEdge(
                project_id=project_id,
                from_type=e["from_type"],
                from_id=e["from_id"],
                to_type=e["to_type"],
                to_id=e["to_id"],
                kind=e["kind"],
                reason=e.get("reason", "")[:500],
            )
        )
    # Store AI-generated positions.
    session.query(ProjectGraphLayout).filter_by(project_id=project_id).delete()
    for node_key, pos in positions.items():
        try:
            ntype, nid = node_key.split("-", 1)
            if ntype not in ("course", "lesson"):
                continue
            session.add(
                ProjectGraphLayout(
                    project_id=project_id,
                    node_type=ntype,
                    node_id=int(nid),
                    x=float(pos.get("x", 0)),
                    y=float(pos.get("y", 0)),
                )
            )
        except (ValueError, AttributeError):
            continue
    session.commit()
    return {"edges": edges, "positions": positions}


def list_edges(session: Session, project_id: int) -> list[ProjectGraphEdge]:
    return session.query(ProjectGraphEdge).filter_by(project_id=project_id).all()


def get_positions(session: Session, project_id: int) -> dict[str, dict]:
    """Return {node_key: {x, y}} for the project."""
    rows = session.query(ProjectGraphLayout).filter_by(project_id=project_id).all()
    return {f"{r.node_type}-{r.node_id}": {"x": r.x, "y": r.y} for r in rows}
