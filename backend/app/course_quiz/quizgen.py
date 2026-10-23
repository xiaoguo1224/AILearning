"""AI question generation for the course question bank.

The learner names the kinds and the counts; the model writes exactly that many
of each. Without the per-kind instruction every run collapses to mcq + short,
which is the complaint this module answers.
"""

import json
import logging
import re

from app.course_quiz.schemas import QUIZ_KINDS

QUIZGEN_STAGE = "quiz_generate"
VARIANT_STAGE = "quiz_variant"
MAX_TOTAL_ITEMS = 20
MAX_MATERIAL_CHARS = 12000

logger = logging.getLogger("studyforge.quizgen")

_KIND_SPECS = {
    "mcq": (
        "选择题：4 个选项，选项互斥且只有一个正确；"
        "answer 必须是 options 中的一项原文"
    ),
    "fill": (
        "填空题：题干里留一个空位（用 ____ 表示），答案是一个词、一个数值或一条公式，"
        "不超过 20 个字；不要写成需要整句作答的问句"
    ),
    "short": (
        "简答题：要求学习者用自己的话解释一个概念、比较两种做法或说明一个过程；"
        "答案是一段完整表述（2-4 句），不是单个词或数值"
    ),
    "truefalse": "判断题：陈述一个关于本课内容的断言；answer 只能是“正确”或“错误”",
    "code": (
        "代码题：给出一个小的编程任务（含必要的起始代码，用 markdown 代码块呈现）；"
        "answer 给出可运行的参考实现"
    ),
}


def build_prompt(
    material: str,
    requests: list[tuple[str, int]],
    lesson_title: str | None,
    user_prompt: str | None = None,
) -> str:
    lines = [
        "你是编程课程的出题老师。根据下面的课程内容出练习题。",
        "",
        "内容：",
        material,
        "",
        "要求：",
    ]
    total = 0
    for kind, count in requests:
        if count <= 0:
            continue
        total += count
        lines.append(f"- {kind}（{_KIND_SPECS[kind]}）× {count} 道")
    if user_prompt and user_prompt.strip():
        lines.append(f"- 用户的额外要求：{user_prompt.strip()}")
    lines += [
        f"共 {total} 道题，难度循序渐进，覆盖内容的不同方面，不要重复。",
        "只返回 JSON 数组，不要解释：",
        # Built from QUIZ_KINDS rather than spelled out: the last time this list was
        # written by hand it kept offering four kinds after a fifth existed, and the
        # model dutifully never produced the new one.
        '[{"question": str, "kind": "' + "|".join(QUIZ_KINDS) + '", '
        '"options": [str]（仅 mcq/truefalse 需要；truefalse 固定为["正确","错误"]）, '
        '"answer": str, "concept": str}]',
    ]
    if lesson_title:
        lines.insert(1, f"本节：{lesson_title}")
    return "\n".join(lines)


def _strip_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n", "", cleaned)
        cleaned = re.sub(r"\n```$", "", cleaned)
    return cleaned.strip()


def parse_items(raw: str, requests: list[tuple[str, int]]) -> list[dict]:
    """Parse and validate the model's reply against what was asked for.

    Lenient about count (a model that writes 3 instead of 4 still gives usable
    questions) but strict about shape: every item needs a question, a known
    kind, and a non-empty answer. Items failing shape are dropped, not repaired.
    """
    try:
        data = json.loads(_strip_fence(raw))
    except (json.JSONDecodeError, ValueError):
        logger.warning("quizgen: model reply did not parse as JSON")
        return []
    if not isinstance(data, list):
        return []
    wanted = {kind for kind, count in requests if count > 0}
    items = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        kind = entry.get("kind")
        question = (entry.get("question") or "").strip()
        answer = (entry.get("answer") or "").strip()
        if kind not in QUIZ_KINDS or kind not in wanted or not question or not answer:
            continue
        options = entry.get("options") or []
        if kind == "mcq":
            options = [str(o) for o in options if str(o).strip()][:6]
            if len(options) < 2 or answer not in options:
                continue
        elif kind == "truefalse":
            options = ["正确", "错误"]
            if answer not in options:
                continue
        else:
            options = []
        concept = (entry.get("concept") or "").strip()[:200]
        items.append(
            {
                "question": question,
                "kind": kind,
                "options": options,
                "answer": answer,
                "concept": concept,
            }
        )
    return items


def build_variant_prompt(item, attempts: list | None = None) -> str:
    """One variant of an existing quiz item: same kind and knowledge point,
    different surface form, so repeating the old answer does not solve it.

    When the learner has attempted the item, their answer history is included
    so the variant targets the actual misunderstanding: it should probe the
    same misconception, not just rephrase the surface.
    """
    spec = _KIND_SPECS[item.kind]
    history = ""
    if attempts:
        lines = []
        for a in attempts[-5:]:  # Most recent five touches.
            mark = "✓" if a.get("correct") else "✗"
            lines.append(f"- 第{a.get('attempt_no')}次作答 {mark}：{a.get('submitted_answer') or '(空)'}")
        history = (
            "\n学习者在这道题上的作答情况（供出题参考，针对其薄弱点出变式）：\n"
            + "\n".join(lines)
            + "\n"
        )
    return (
        "你是编程课程的出题老师。根据下面这道题，出一道变式题："
        "考察同一个知识点、同一种题型，但换场景、换数字、换表述，"
        "背下原题答案的人做不对变式题。\n\n"
        f"原题（{item.kind}）：{item.question}\n"
        f"原题答案（只作参考，不要照抄）：{item.answer}\n"
        f"{history}"
        f"题型要求：{item.kind}（{spec}）\n\n"
        "只返回 JSON 数组，不要解释，恰好 1 道题：\n"
        '[{"question": str, "kind": "' + item.kind + '", '
        '"options": [str]（仅 mcq/truefalse 需要；truefalse 固定为["正确","错误"]）, '
        '"answer": str, "concept": str}]'
    )
