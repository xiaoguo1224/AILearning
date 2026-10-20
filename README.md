# Personal AI Learning Agent

基于 [StudyForge](https://github.com/Akhilvallala1/studyforge) 的**个人 AI 自适应编程学习工作台**。这是提供给 Codex 的**目标项目文档集**，不是已经完成开发的功能清单。

## 产品目标

在一个网站里管理多个学习项目，以固定课程和自由学习两种方式学习；在本地 IDE 写、跑代码，然后手动上传代码/运行日志，由 AI 提供静态审查、分级提示、针对性补课与变式题。上传论文、PDF 或网页后，自动整理知识草稿并建立跨项目关联。

## 三个完整使用场景

1. **计划学习**：PyTorch Day 1 → 学习知识点 → 本地代码练习 → 上传代码和日志 → 分级诊断 → 修复 → 新题复测 → 学习记录。
2. **自由学习**：进入「多模态 Token 对齐」项目 → 上传论文 → 询问 SPDM → AI 引用资料解释 → 生成小练习 → 保存知识草稿。
3. **跨项目建议**：自由学习中发现矩阵运算薄弱 → 提示在 PyTorch 项目安排复习 → 用户确认 → 写入目标项目计划。

## 核心边界

- **仅供个人使用**，不需要多用户账户。
- **不执行上传代码**：用户本地运行、主动上传文件及日志；平台进行静态分析和 AI 辅导。
- 无额外 CLI、在线 IDE、沙箱、GPU 调度和云端训练。
- 固定课程主线 + 自由学习；普通笔记自动保存草稿，权威核心内容须审核。
- 课程与学习系统尽量复用 StudyForge；扩展 Project、Resource、Submission、AgentSession 等模块。

## 技术基线

上游源码当前是 **Next.js / React + FastAPI + SQLAlchemy + SQLite**。优先保留现有技术栈，并根据实际安装情况配置模型供应商。新增模块不能破坏现有课程、Quiz、FSRS、Tutor 及课程删除语义。

## 文档导航

- [`AGENTS.md`](AGENTS.md)：主 Agent 长期开发规范。
- [`docs/PRD.md`](docs/PRD.md)：需求、页面、用户流程和验收。
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：目标系统、领域模型、接口和边界。
- [`docs/TASKS.md`](docs/TASKS.md)：可逐项执行的工程任务。
- [`docs/DECISIONS.md`](docs/DECISIONS.md)：技术及产品决策记录。
- [`docs/PROGRESS.md`](docs/PROGRESS.md)：真实进度与测试证据。

## Codex 开发入口

在**克隆或 Fork 的 StudyForge 仓库根目录**放置这些文档。注意：上游仓库可能已经包含 README、`docs/ARCHITECTURE.md`、`AGENTS.md` 或局部 Agent 规则。**先阅读并合并，不要直接覆盖原文件**。本文件是产品目标 README 草案；原项目安装说明与许可证应保留。

建议首次给 Codex：

> 阅读 AGENTS.md 与 docs 下全部文档；检查当前源码和 git 状态，完成 P0 环境与基线验证。之后自主按 TASKS.md 的依赖顺序实现、测试、修复并更新进度。没有产品冲突或外部阻塞时不要只做计划就停止。不要执行用户上传代码。

## 运行与验证

默认本机运行，需要 Python >=3.11、Node.js >=20.19（建议 24）。后端（在 `backend/`）：

```powershell
uv sync --extra dev --frozen
Copy-Item .env.example .env
# 在 .env 中设置 STUDYFORGE_LLM_PROVIDER=fake，可离线验证且不需要密钥
uv run uvicorn app.main:app --reload --host 127.0.0.1
```

前端（在 `frontend/`，另一个终端）：

```powershell
npm ci
Copy-Item .env.local.example .env.local
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1
```

访问 <http://localhost:3000>；API 文档为 <http://localhost:8000/docs>。前端 `NEXT_PUBLIC_API_URL` 与后端地址一致；后端 `STUDYFORGE_CORS_ORIGINS` 默认允许 `http://localhost:3000`。数据库由 `STUDYFORGE_DB` 指定，默认位于后端工作目录。真实教学需配置 Anthropic 或 Ollama；Fake 仅用于确定性验收，不代表真实教学质量。模型配置和费用限制见 [`backend/.env.example`](backend/.env.example)。请仅绑定本机访问，本项目没有登录保护。

验证：后端 `uv run pytest -q`、`uv run ruff check app tests`；前端 `npm test`、`npm run lint`、`npm exec tsc -- --noEmit`、`npm run build`。实际结果持续记录在 [`docs/PROGRESS.md`](docs/PROGRESS.md)。

现有课程入口 `/courses`、测验、`/review`、概念 Tutor 和 `/usage` 保留。Project 等目标功能以 TASKS 验收状态为准。上游安装、费用估算及删除语义原文完整保留在 [`docs/upstream/README.md`](docs/upstream/README.md)，其中社区/多人路线不属于本项目范围。数据库升级前必须备份，参见 [`docs/OPERATIONS.md`](docs/OPERATIONS.md)。

## 许可证与上游

基于 StudyForge（基点 `d6fc957`），保留 [MIT LICENSE](LICENSE) 及 Akhil Vallala 的版权声明。Git `origin` 为本项目，`upstream` 为 StudyForge；开发提交默认不自动推送。
