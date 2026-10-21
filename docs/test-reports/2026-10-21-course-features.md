# 课程功能包测试记录（2026-10-21 晚）

覆盖用户五个需求：题库聚合+AI出题、课程问答+引用、生成重试+重新生成、内容加深+公式图表、Markdown导入+手动修改、课时目录侧边栏、代码题AI判分。

## 后端

全量：`uv run pytest tests/ -q --ignore=tests/test_e2e.py` → **1381 passed, 2 skipped**

### 新测试文件

**tests/test_course_quiz.py**（8 passed）
- `test_quiz_bank_aggregates_without_answers`：题库按模块→课时聚合，答案不泄露（item keys == {id, question, kind, options, concept, attempt_state}）
- `test_quiz_bank_404_for_missing_course`：404
- `test_generate_questions_mixed_kinds`：一次指定 mcq×1/short×1/truefalse×1/code×1 四种题型，truefalse options 被服务端规范为 ["正确","错误"]，新题出现在题库中
- `test_generate_questions_lesson_scoped`：lesson_id 限定单课时
- `test_generate_questions_unknown_kind_422` / `test_generate_questions_empty_and_over_cap_422`：未知题型 422、全零 422、超 20 题 422
- `test_generate_questions_cross_course_lesson_422`：别课程的 lesson_id 被拒
- `_seed_course` 曾用直接赋值 `main.get_provider = ...` 污染后续测试（导致 `test_invalid_provider_generation_is_controlled` 在全量中失败），已改为 monkeypatch 传参修复

**tests/test_course_tutor.py**（8 passed）
- `test_course_scope_parses`：`course:1` 解析，非法 key 返回 None
- `test_course_key_grounds_whole_course`：course key 问答能读到全课程课时，concept_label 为课程标题
- `test_course_key_missing_course_no_material`：课程不存在时无材料但不崩
- `test_course_key_post_and_history`：POST 两轮，会话记忆保留 4 条消息
- `test_refs_resolution`：refs 解析（精确标题→lesson_id，去重，未知丢弃，上限 5）
- `test_regenerate_404_and_422`：课程不存在 404、无课时文本 422
- `test_regenerate_streams_new_course`：重新生成流式产出新课程，标题带"（重新生成）"，原课程不动

**tests/test_course_content.py**（7 passed）
- `test_import_builds_modules_and_lessons`：文件夹导入建出 2 模块 3 课时，数字前缀排序并剥离，`# ` 标题作课时名，course.json 定标题
- `test_import_falls_back_to_folder_name`：无 course.json 时用文件夹名；根目录零散文件并入一个模块
- `test_import_refuses_unsafe_paths`：`../` 与绝对路径 422（修复：course.json 曾只认根目录一层，改为任意深度文件名匹配）
- `test_import_refuses_without_markdown`：无 md 文件 422
- `test_patch_lesson_content` / `test_patch_lesson_requires_a_field`：改标题正文概念；空 patch 422；404
- `test_patch_course`：改课程标题简介；404

**tests/test_code_grade.py**（10 passed）
- `test_correct_code_answer_records_llm_verdict`：代码题作答走模型判分，correct=True，feedback 原样返回，attempt.grader == "llm_code"，只调模型 1 次
- `test_wrong_code_answer_reports_the_error`：判错时 feedback 说明具体错误
- `test_unparseable_verdict_is_502_without_recording`：模型输出不可解析 → 502 且不记录 attempt（provider 故障不记为答错）
- `test_non_code_items_still_exact_match_without_feedback`：short 题仍走精确匹配，不调模型，feedback 为 null
- `test_parse_verdict_rejects_junk`（5 组参数）：非 JSON/非对象/correct 非布尔/feedback 空/缺字段均拒
- `test_parse_verdict_accepts_shape`：合法形状通过

**tests/test_usage_attribution.py**（24 passed）
- 新 stage 必须进 pin 集合：`quizgen.QUIZGEN_STAGE`、`code_grade.CODE_GRADE_STAGE`
- 测试按自身设计驱动全部 stage：quiz_generate 用 `_QuizGenStageProvider` 走 `/api/courses/{id}/quiz/generate`；code_grade 用 `_CodeGradeStageProvider` 走 `/quiz/{item_id}/answer`
- 曾因全量运行时 `test_course_quiz` 先记录了 `quiz_generate` 导致 `recorded <= explained` 失败，按测试设计补驱动后通过

### 修改的旧测试
- `tests/test_tutor.py`：`_TUTOR_SYSTEM_AT_EXTRACTION` pin 跟随 tutor system prompt 的 refs 规则更新；发现并删除 tutor.py 一处多余逗号
- `tests/test_tutor_endpoints.py`：消息 key 集合加入 "refs"
- `tests/test_generation.py`：重试计费 pop 次数更新（每次尝试=1 call+1 parse），新增重试成功用例

## 前端

- `npx tsc --noEmit`：干净
- `npx eslint src/ tests/`：干净（修了 4 处：CourseQuizSection/MermaidBlock 的 effect 内 setState 改写法、api.ts 两个 `let buffer`→const）
- `npx vitest run`：**28 文件 190 tests 全过**
- `npx next build`：成功

### 新测试
- `tests/quiz-kinds.test.tsx`（4）：truefalse 渲染两个 radio；code 渲染 textarea；short 保持单行 input；textarea 里 Enter 不提交、Ctrl+Enter 提交
- `tests/quiz-code-feedback.test.tsx`（2）：code 作答后渲染 "AI 判分：" verdict；short 作答无 verdict 块
- `tests/lesson-toc.test.tsx`（3）：extractToc 按序提取 h2/h3 并跳过代码围栏；无子标题返回空；LessonMarkdown 的 h2/h3 带 toc-n id 且与 TOC 条目一一对应
- `tests/fixtures.ts`：`quizItem` kind 扩展四种；`answerResult` 加 `feedback` 字段

## 真机联调（fake provider，backend :8000 + next start :3124）

- `POST /api/courses/import` → 201，2 模块 3 课时，标题/排序/前缀剥离正确
- `GET /api/courses/{id}/quiz` → 200，total=0（未出题）
- `POST /tutor/messages` `{course:1}` 两轮 → 200，concept_label="深度学习笔记"，历史保留，会话记忆连续
- `PATCH /api/lessons/{id}` → 200，标题即时更新
- `POST /api/courses/{id}/quiz/generate`（fake）→ 502 `{"detail":"The model did not return usable questions."}`，受控失败无 traceback（fake provider 无出题分支，符合预期；真实出题由后端 stub 测试覆盖）
- 截图验证：课程页"题目"区折叠+AI出题按钮、"问答"区多轮历史+引用+用量；课时页右侧"目录"侧边栏、KaTeX 公式、Mermaid 流程图、`编辑`按钮均正常渲染

## 未覆盖（需真实模型 key，用户需重新提供）
- AI 出题真实出题质量、代码判分真实 verdict、课程重新生成真实内容、流式 SSE 真实走查
- 已知未修（非本次任务）：中文检索分词（retrieval.py）、review 行号 off-by-one
