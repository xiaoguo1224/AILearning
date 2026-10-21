"""AI extraction of project learning-graph relationships."""

import json
import uuid

from sqlalchemy.orm import Session

from app.llm import get_provider
from app.metering import MeteredLLM
from app.project_graph.models import ProjectGraphEdge

EXTRACT_STAGE = "project_graph_extract"

SYSTEM_PROMPT = """You are analyzing a learning project made of courses, each with chapters (lessons).
Given the course and chapter titles (and short summaries when available), extract the
learning-order relationships between them.

Return a JSON array. Each item:
{
  "from_type": "course" | "lesson",
  "from_id": <int>,
  "to_type": "course" | "lesson",
  "to_id": <int>,
  "kind": "prerequisite" | "related" | "sequence",
  "reason": "<one sentence, Chinese, why the learner should do `from` before `to`>"
}

Rules:
- "prerequisite": `to` genuinely requires concepts from `from`. Be conservative.
- "sequence": the natural teaching order within/across courses when no hard prerequisite exists.
- "related": topical overlap worth reviewing together, order flexible.
- Cover every chapter: each chapter (except the very first) should have at least one incoming edge.
- Do not invent ids. Use only the ids given.
- Reply with ONLY the JSON array, no other text.
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
) -> list[dict]:
    """Run the LLM extraction and persist edges, replacing old ones."""
    if not courses:
        session.query(ProjectGraphEdge).filter_by(project_id=project_id).delete()
        session.commit()
        return []

    run_id = uuid.uuid4().hex
    meter = MeteredLLM(get_provider(), run_id)
    prompt = build_prompt(courses)
    raw = meter.generate(EXTRACT_STAGE, SYSTEM_PROMPT, prompt)

    try:
        # Strip markdown fences if the model adds them.
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.rsplit("```", 1)[0]:
                text = text.rsplit("```", 1)[0]
        items = json.loads(text.strip())
    except (json.JSONDecodeError, IndexError):
        items = []

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
            return f_ok and t_ok and item["kind"] in ("prerequisite", "related", "sequence")
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
    session.commit()
    return edges


def list_edges(session: Session, project_id: int) -> list[ProjectGraphEdge]:
    return session.query(ProjectGraphEdge).filter_by(project_id=project_id).all()
