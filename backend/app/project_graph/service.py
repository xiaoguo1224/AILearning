"""AI extraction of project learning-graph relationships."""

import json
import uuid

from sqlalchemy.orm import Session

from app.llm import get_provider
from app.metering import MeteredLLM
from app.project_graph.models import ProjectGraphEdge

EXTRACT_STAGE = "project_graph_extract"

SYSTEM_PROMPT = """You are analyzing a learning project made of courses, each with chapters (lessons).
Given the course and chapter titles (and short summaries when available), extract THREE
kinds of relationships:

1. CONTAINMENT: every course contains its chapters. Emit one edge per chapter:
   {"from_type": "course", "from_id": <course id>, "to_type": "lesson",
    "to_id": <lesson id>, "kind": "contains",
    "reason": "<course> 包含章节 <lesson>"}

2. COURSE ORDER: the learning sequence between courses. Which course should be
   studied first, based on topic dependencies?
   {"from_type": "course", "from_id": <earlier>, "to_type": "course",
    "to_id": <later>, "kind": "course_sequence", "reason": "<why, Chinese>"}

3. CHAPTER ORDER: the learning sequence between chapters (within a course and
   across courses). Which chapter should come first?
   {"from_type": "lesson", "from_id": <earlier>, "to_type": "lesson",
    "to_id": <later>, "kind": "chapter_sequence", "reason": "<why, Chinese>"}

Also allowed when the dependency is strong:
- "prerequisite": `to` genuinely requires concepts from `from`. Be conservative.
- "related": topical overlap worth reviewing together, order flexible.

Rules:
- Containment edges: emit ALL of them, one per chapter.
- Sequence edges: every chapter (except the very first to study) should have at
  least one incoming chapter_sequence or prerequisite edge, forming a coherent
  learning path. Every course (except the first) should have an incoming
  course_sequence or prerequisite edge.
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
    session.commit()
    return edges


def list_edges(session: Session, project_id: int) -> list[ProjectGraphEdge]:
    return session.query(ProjectGraphEdge).filter_by(project_id=project_id).all()
