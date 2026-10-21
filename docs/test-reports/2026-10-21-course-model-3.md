# 产品模型落地三块测试记录（2026-10-21 晚）

用户拍板"三块都做"。产品模型（已记 MEMORY）：Project 只做课程整合，项目级提问看到所有课程；学习功能下放到课程。

## 1. 项目提问跨课程检索

改动：`app/agent/retrieval.py`
- 新增 `_lesson_hits`：经 `project_courses` 查项目关联课程的课时，用 `_terms`（CJK 二元词）做 LIKE 检索，按命中词数排序。
- `retrieve()` 合并资源 chunks 与课时：统一按去停用词后的词表命中数评分，取前 5；课时来源 `resource_id=0`、`filename`=课程名、`locator`=课时名，前端引用渲染为 `[S1] 课程名 · 课时名`（ExploreChat 无需改动）。
- 模块 docstring 更新：检索范围=项目上传资源+关联课程课时。

测试 `tests/test_agent_cross_course.py`（3 passed）：
- `test_project_question_sees_linked_course_lessons`：两课程关联后，分别提问命中各自课时，filename/locator/text 正确
- `test_unlinked_course_lessons_stay_invisible`：未关联课程的课时不泄露（曾因两课共享"概念"二元词导致 linked 课时合法命中，修正断言为只查 unlinked 文件名）
- `test_resources_and_lessons_merge`：上传资源与课时同时被提供，marker 为 S1..Sn 连续编号，总数 ≤5

真机：建项目+关联两课程后，`retrieve` 对"为什么 QK^T 要除以根号 dk？"返回 `[S1] resource_id=0 file=a loc=注意力`；"Adam 优化器有什么特点？"返回 course-b 的课时。

## 2. 代码题提示下放

改动：
- 后端 `app/quiz_hint.py`（新）：stage `quiz_hint`，`hint_for(meter, question, reference, submitted, level)`；提示阶梯 1=位置线索、2=原理、3=关键修正，永不给完整解法；`parse_hint` 校验形状。
- `POST /quiz/{item_id}/hints`（main.py）：仅 code 题（否则 422），level 1–3（否则 422），带学习者最近一次提交进 prompt；计费 402，解析失败 502。
- 前端：QuizSection 代码题答错后出现"获取提示"按钮，逐级取 1→3 展示；`getQuizHint` 入 api.ts；中文文案。

测试：
- 后端 `tests/test_code_grade.py` +3（13 passed）：三级提示渐进返回；level=4→422、404、非 code 题→422；不可解析→502
- 前端 `tests/quiz-hint-variant.test.tsx`：答错后出现提示按钮并逐级请求（level 参数断言），答对/非代码题无按钮，`renderItemAction` 渲染

真机（fake）：`POST /quiz/{id}/hints` → 502 `{"detail":"AI 提示生成失败，请重试一次。"}` 受控无 traceback；level=9 → 422。成功路径由 stub 测试覆盖。

## 3. 变式题下放

改动：
- `app/course_quiz/quizgen.py`：`VARIANT_STAGE="quiz_variant"`，`build_variant_prompt(item)`（同题型同知识点、换场景/数字/表述，复用 `_KIND_SPECS`）。
- `POST /api/courses/{course_id}/quiz/{item_id}/variant` → 201：跨课程题目 422、不在 404；变式存入原题所在课时，返回题库形状（不含 answer）。
- 前端：QuizSection 新增可选 `renderItemAction`；CourseQuizSection 每题旁"变式"按钮，生成后刷新题库。

测试：
- 后端 `tests/test_course_quiz.py` +2（9 passed）：变式断言 prompt 含"变式题"，返回不含 answer，题库 total 2；跨课程题目 422、404
- 前端：`renderItemAction` 渲染测试（见上）

真机（fake）：→ 502 `{"detail":"The model did not return a usable variant."}` 受控。成功路径由 stub 测试覆盖。

## 回归
- 后端：`pytest tests/ --ignore=test_e2e.py` → **1389 passed, 2 skipped**
- 前端：vitest **29 files / 193 passed**，tsc clean，eslint clean
- `tests/test_usage_attribution.py` pin 集合新增 `quizgen.VARIANT_STAGE`、`quiz_hint.HINT_STAGE`，并在场景内驱动两条新 stage（24 passed）

## 未覆盖（需真实模型 key）
- 提示/变式/跨课程问答的真实模型输出质量；跨课程 explore 端到端（检索层已真机验证）。
