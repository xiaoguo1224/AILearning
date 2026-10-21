"""AI extraction of knowledge points (concepts) from lesson content."""

import json
import uuid

from sqlalchemy.orm import Session

from app import models
from app.llm import get_provider
from app.metering import MeteredLLM

EXTRACT_STAGE = "concept_extract"

SYSTEM_PROMPT = """你是课程知识点提炼助手。给定一节课的标题和内容，提炼出本节课的核心知识点。

返回 JSON 数组，每项：
{"concept": "<知识点名称，简洁中文>", "importance": <1-5 重要程度>}

规则：
- 提炼 3-8 个核心知识点，不要太多
- 知识点名称简洁，2-10 个字
- 按重要程度排序
- 只返回 JSON 数组，不要其他文字
"""


def extract_lesson_concepts(content: str, title: str) -> tuple[list[str], dict[str, int]]:
    """Extract concept names and their importance (1-5) from a lesson's content via LLM.
    Returns (concepts, {concept_name: importance})."""
    if not content or not content.strip():
        return [], {}
    run_id = uuid.uuid4().hex
    meter = MeteredLLM(get_provider(), run_id)
    prompt = f"课程标题：{title}\n\n课程内容：\n{content[:4000]}"
    raw = meter.generate(EXTRACT_STAGE, SYSTEM_PROMPT, prompt)
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
        items = json.loads(text.strip())
        concepts = []
        importance = {}
        for item in items:
            if isinstance(item, dict) and item.get("concept"):
                name = str(item["concept"]).strip()[:50]
                if name:
                    concepts.append(name)
                    try:
                        imp = int(item.get("importance", 3))
                        importance[name] = max(1, min(5, imp))
                    except (ValueError, TypeError):
                        importance[name] = 3
            elif isinstance(item, str):
                name = item.strip()[:50]
                if name:
                    concepts.append(name)
                    importance[name] = 3
        concepts = [c for c in concepts if c][:20]
        return concepts, {k: v for k, v in importance.items() if k in concepts}
    except (json.JSONDecodeError, IndexError):
        return [], {}


def extract_course_concepts(session: Session, course_id: int) -> dict[int, list[str]]:
    """Extract concepts for all lessons in a course. Returns {lesson_id: concepts}."""
    course = session.get(models.Course, course_id)
    if not course:
        return {}
    result = {}
    for mod in course.modules:
        for lesson in mod.lessons:
            concepts, importance = extract_lesson_concepts(lesson.content or "", lesson.title)
            if concepts:
                lesson.concepts = concepts
                lesson.concept_importance = importance
                result[lesson.id] = concepts
    session.commit()
    return result
