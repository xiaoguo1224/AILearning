# 2026-10-25：代码评审、复制与历史回答

## 实现范围

取消独立 AST/规则检查，保留上传校验与 AI 评审；共享 Markdown 代码块复制；全题型、复习、补课、变式题的不可变作答快照；按历史回答补生成分析/解析，已有结果或进行中任务复用。

开始于 main / aa6eaf3，工作区干净。只本机运行，不使用 Docker，不运行完整仓库测试，不发布线上或操作线上学习库。

## 实际执行的检查

修改前相关后端 39 passed，前端 5 passed。

后端（backend/.venv/Scripts/python.exe）：

```text
-m pytest tests/test_answer_history.py tests/test_attempts.py tests/test_submissions.py tests/test_question_submissions.py tests/test_course_quiz.py tests/test_tutor_migration.py tests/test_e2e_flows.py::test_flow1_pytorch_study_loop tests/test_usage_attribution.py::test_every_stage_actually_recorded_is_one_the_page_can_explain -q --tb=short
```

结果：**112 passed / 2 skipped**。覆盖原题/选项/答案/反馈快照、所有题型、附件与代码日志、变式题、提示、后续生成、缓存、失败重试、并发复用、来源删除后的生成、迁移幂等和旧业务行保留。随后补强旧代码提交上下文标签和概念快照后，`pytest tests/test_answer_history.py tests/test_attempts.py -q --tb=short`：**49 passed**。

前端：

```text
npx vitest run tests/code-block-copy.test.tsx tests/answer-history.test.tsx tests/code-question-detail.test.tsx tests/quiz-code-feedback.test.tsx tests/quiz-hint-variant.test.tsx tests/quiz-job-reattach.test.tsx --maxWorkers=2
npx tsc --noEmit
npm run build
```

定向测试：**6 文件 / 18 passed**；TypeScript 和最终生产构建通过。jsdom 有 getComputedStyle 伪元素未实现提示，无失败。

Ruff：新增历史模块、submissions、attempts、course_quiz、相关改动测试通过；前端全部改动组件、API、新增测试使用显式路径 ESLint 通过。最后的 AnswerHistory 卸载清理/AppSidebar 手机入口再 lint 和构建通过。`git diff --check` 通过。

卸载轮询清理后单独复验 `npx vitest run tests/answer-history.test.tsx --maxWorkers=2`：4 passed。

额外宽检查显示 main.py 仍有 **9 项既有 Ruff 问题**（导入、宽异常、既有未使用导入）。用 `git show aa6eaf3:backend/app/main.py | python -m ruff check --stdin-filename backend/app/main.py - --output-format concise` 对照，基线也是相同 9 项。没有宣称全仓 lint 通过。

## 迁移验证

初次迁移检查暴露 init_db 迁移 engine 与 SessionLocal 绑定不同：回填可能查到另一个未初始化的库。初始化/回填会话改为显式绑定实际 engine，归档及 FTS 初始化发生在目标库；补齐迁移测试 jobs 注册和 auth/history/FTS 物理表白名单，不降低 schema 比较。迁移单独复验 **24 passed / 2 skipped**，也包含在最终定向批次中。

## 本机浏览器

隔离库：F:/Temp/ail-learning-history-check/verification.sqlite3。本机 Uvicorn 8001、Next dev 3001；受控无付费 provider。未将验证数据加入个人学习库。Chrome MCP 启动失败后，用已安装 Playwright 和本机 Edge 验证。

真实断言通过：密码门禁、课程代码复制、历史原回答与题干、按旧回答补生成分析和题目解析、完整答案主动展开、刷新复用结果；1440px/390px 无横向溢出，无 pageerror。Windows 剪贴板读回会把 LF 转为 CRLF，按换行标准化后比对代码和缩进；组件测试另核对 writeText 收到的原始 LF 文本。

截图已人工查看，位于忽略目录 output/playwright/：history-lesson-desktop.png、history-desktop.png、history-mobile-light.png。深色主题最后一轮检查未完成，不将脚本中尚未执行的断言当成通过。

## 边界与限制

- 旧记录未保存的题干/点评无法恢复；仅归档已有证据。当前题目上下文单独标记，不能冒充原始快照，补生成也告诉模型该限制。
- AI 评审不是服务器执行代码。没有用真实付费模型检验回答质量。
- 完整仓库测试按用户要求未运行；线上旧 FTS 等既有问题不在本轮验收范围。
- 额外的 `next start --hostname 127.0.0.1 --port 3001` 本机生产启动被自动审批拒绝，仅返回 blocked by policy。没有绕过，也未记作启动通过；开发服务/浏览器和最终构建是分别验证的结果。

## Git 交付

- 1b8f63e：Markdown 代码块复制与反馈。
- 9757b22：移除规则检查，接入作答快照、历史入口、补生成与缓存，以及相关回归。
- 文档与本报告随后的独立提交归档；没有推送或发布。验证用隔离服务在结束时停止。
