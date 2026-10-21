# 测试记录：重新生成分级 + 代码题详情页（2026-10-21）

## 需求来源
用户连续三条消息：
1. 「重新生成分为章节和课程，每一个章节都支持采用和不采用新的内容」
2. 「然后章节支持自己修改」
3. 「代码题才去复用项目中的提交功能…代码题就是点击进去详情就是以前项目的提交页面，增加题目显示和历史记录切换，不要所有东西都放到一页去，然后原有提交功能也得根据实际情况做修改」
4. 「所有的界面都不要一次性把所有东西展示出来，可以做成其他方式，点击后才出现，不然太乱了」
5. 「章节课程的重新生成，没有复用课程的ai生成功能，导致一直需要等待，也没有任何反馈」

## 后端

### 课时重新生成（SSE 流）
- `POST /api/lessons/{lesson_id}/regenerate/stream`
- 事件：`regen_started` → `regen_draft` → `regen_done`，或 `error`
- 404/422 在首字节前完成（课时不存在、无内容可重写）
- 草稿不保存，前端预览后 采用→PATCH / 不采用→丢弃

测试 `test_lesson_regenerate_returns_an_unsaved_draft`（tests/test_course_tutor.py）：
- 用 stub provider（返回固定 JSON）走完整 SSE 流
- 断言事件顺序 `regen_started` → `regen_done`，draft 内容正确
- 断言数据库中课时内容未变（草稿未保存）
- 断言 404（课时不存在）

### 课程重新生成（逐节 draft 流）
- `POST /api/courses/{course_id}/regenerate/stream` 重写：不再创建新课程
- 事件：`lesson_start` → `lesson_draft` / `regen_lesson_failed` → `regen_done`
- 每节 draft 不保存，前端逐节 采用（PATCH）/ 不采用

测试 `test_regenerate_streams_per_lesson_drafts`：
- FakeProvider 走完整流，断言首事件 `lesson_start`、尾事件 `regen_done`
- 断言每节都有 draft 且含 content
- 断言课时表未被修改

### 题目维度代码提交（复用提交/评审管线）
- `Submission.quiz_item_id` 新增（ADDED_COLUMNS，INTEGER 可空，无 FK——SQLite 不能给已存在表加 FK）
- `Submission.project_id` 改为可空：`_migrate_submissions_question_scope()` 一次性 rebuild（仅当已安装 schema 仍为 NOT NULL 时执行；新安装直接由 create_all 建出可空形状）。用户 DB 的 submissions 表为空，迁移已验证通过。
- `POST /api/quiz/{item_id}/submissions`：仅 code 题可提交；版本按题目递增（v1, v2…）；project_id=NULL
- `GET /api/quiz/{item_id}/submissions`：该题提交历史（版本倒序）
- `POST /submissions/{id}/review`：question-scoped 提交跳过 `writable_project`；LLM 评审 prompt 加入题目（`ReviewContext.question`），模型对照题目判代码
- `GET /api/quiz/{item_id}`：单个题目（供详情页；答案不返回）

测试 tests/test_question_submissions.py（3 个，全过）：
- `test_question_submission_creates_versions`：连投两次得 v1/v2，project_id 为 null，历史倒序
- `test_question_submission_validates`：题目不存在 404、空代码 422
- `test_question_review_runs_without_project`：静态评审 201，状态变为 reviewed

### 回归
- 后端全量：1398 passed, 2 skipped

## 前端

### 重新生成
- `RegenerateLessonButton`：SSE 流式（`streamLessonRegeneration`），对话框保持打开显示「正在重写章节…」进度，draft 到达后转可编辑预览（`RegenDraftPreview`：标题/概念/内容可改，预览/编辑切换），采用→PATCH / 不采用→关闭
- `RegenerateCourseButton`：逐节 draft 列表，每节可展开看 draft（可编辑）、采用/不采用；采用后 PATCH 该节
- `streamCourseRegeneration` 事件类型扩展：`lesson_start` / `lesson_draft` / `regen_lesson_failed` / `regen_done`

### 代码题详情页
- 路由 `/courses/{courseId}/quiz/{itemId}`，页签：题目 / 作答 / 评审 / 历史
- 作答页提交后自动跳评审；历史页点击版本切换评审内容
- 评审复用 `SubmissionReviewPanel`（静态分析 + AI 评审 + hint 阶梯）
- `QuizSection` 的代码题改为链接「打开代码题」→ 详情页（不再内联 textarea 作答）
- 项目提交详情页：question-scoped 提交访问时 notFound（它们有自己的页面）

### 点击展开（渐进披露）
- `CourseQaSection`：默认折叠，点击展开
- `LessonQuizPanel`：默认折叠，点击展开
- 代码题详情页：页签式

### 测试
- tests/regen.test.tsx（3）：draft 预览编辑后采用传编辑版、不采用丢弃；课时重新生成走流式并显示进度、采用后 PATCH
- tests/code-question-detail.test.tsx（2）：提交代码后跳评审；历史切换版本
- tests/quiz-kinds.test.tsx：代码题渲染链接（原 textarea 测试已随 UI 移除）
- 删除 tests/quiz-code-feedback.test.tsx、tests/quiz-hint-variant.test.tsx（测的是已移除的内联作答 UI；hint 功能由提交评审的 hint 阶梯承接）
- 前端全量：31 文件 197 passed；tsc + eslint 干净

## i18n
zh-CN 新增：重新生成/采用/不采用/正在重写章节…/打开代码题/题目/作答/评审/历史 等
