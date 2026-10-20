# PROGRESS — 开发进度与真实验证记录

> 这是交给 Codex 的初始进度，不是已开发成果。每次会话结束必须追加新的记录，不覆盖以往测试证据。

## 当前状态

- 当前里程碑：**P0 上游环境与基线验证**。
- 已确定：产品需求、单人本地运行边界、项目化、课程/自由学习、自动知识草稿与核心审核、跨项目确认。
- 已准备：AGENTS、PRD、ARCHITECTURE、TASKS、DECISIONS、README 的目标文档草案。
- 已有源码审查：通过 GitHub 阅读 StudyForge 目录、models、ingest、generation、tutor、remediation、db、部分 API 及依赖文件。
- 尚未完成：本地克隆和运行、测试结果、任何新功能开发、迁移及真实验收。

## 上游静态审查主要观察

- 源码目录有 `backend/app/main.py`、`models.py`、`ingest.py`、`generation.py`、`tutor.py`、`remediation.py`、`fsrs.py`、`review.py` 及 backend/tests、frontend/tests。
- 原系统已有课程、测验、概念复习和辅导；尚无独立 Project、持久原始论文来源、提交/日志静态评审和项目级自由学习。
- `backend/app/db.py` 的列添加机制有明确能力边界；复杂迁移需谨慎。
- 后端依赖要求 Python >=3.11；前端 Next.js/React；LLM 为 Anthropic/Ollama/Fake。
- 以上为**静态审查信息，不是本地测试通过的证明**。

## 本轮测试

| 命令 | 是否实际执行 | 结果 |
|---|---|---|
| `uv sync --extra dev` | 否 | 未运行 |
| `uv run pytest -q` | 否 | 未运行 |
| `npm ci` | 否 | 未运行 |
| `npm test` | 否 | 未运行 |
| `npm run build` | 否 | 未运行 |
| 浏览器端到端课程验收 | 否 | 未运行 |

## 下次工作入口

1. 在实际 StudyForge 仓库中检查所有已存在文档，**合并**本包，不覆盖上游安装指南和现有架构说明。
2. 检查 `git status` 和 HEAD，建立分支。
3. 执行 P0-03 / P0-04 的依赖安装和测试，记录错误、操作系统和环境。
4. 基线验收后，进入 P1-01。

## 追加记录模板

### 2026-10-20 — P0-02 上游文档合并
- 前项提交：P0-01 `4989e74`。本项提交：本记录所在提交（`git log --grep="P0-02"`）。
- 将 `d6fc957` 的 README/ARCHITECTURE 字节原文保存在 `docs/upstream/`；当前 README 恢复安装、配置、测试、许可证入口，ARCHITECTURE 合并真实 API、计量、删除、FSRS/Tutor 与迁移语义。
- 上游旧 ARCHITECTURE 的 FSRS/Tutor planned 描述已明确标为历史，不作为当前事实；保留用户目标需求和已有删除文件的状态。
- 验证：通过 Git 原文与本地文件字节比较；LICENSE 未改。运行测试尚在下一项进行，不声称本项已验证应用。

### 2026-10-20 — P0-01 仓库与工作区核查
- 上游基点：`d6fc957`；分支：`codex/personal-learning-p0`。提交：本记录所在提交（`git log --grep="P0-01"`）。
- 完整读取根 AGENTS、README、PRD、ARCHITECTURE、TASKS、DECISIONS、PROGRESS 及上游 README/ARCHITECTURE、MIT LICENSE。
- `git status --short`：开始时 README/ARCHITECTURE 已修改，目标规范与进度文档未跟踪，`.claude/agents/*`、CLAUDE.md、CONTRIBUTING.md 已删除；保留所有既有改动，不提交这些删除。
- `git switch -c codex/personal-learning-p0` 成功；将原远程保留为 `upstream`，`origin` 指向 `https://github.com/xiaoguo1224/AILearning.git`。未推送。
- 无 `.codegraph/`；按规范跳过索引。启动 3 个只读协作 Agent，分别检查后端、前端与上游文档。
- 环境：Windows/PowerShell，Python 3.12.0、uv 0.10.9、Node 24.0.0、npm 11.3.0、Docker Engine 29.3.1、Compose 5.1.1。
- Docker 最初未运行；以隐藏窗口启动已安装的 Docker Desktop 后 `docker info` 成功。仓库尚无 Compose 配置。
- 验收：分支、HEAD、目录、工作区、远程均已实际核查；下一项 P0-02 文档合并，然后执行容器内测试。无应用功能在此步被标为通过。

```markdown
### YYYY-MM-DD HH:mm — Session N
- 分支/提交：
- 任务：
- 改动文件：
- 已执行命令及结果：
- 未验证的事项：
- 风险与阻塞：
- 下一步：
```
