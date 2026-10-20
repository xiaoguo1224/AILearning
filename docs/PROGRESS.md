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

### 2026-10-20 — P0-06 基线、备份与恢复
- P0-05 提交 `43d1ef9`。本项提交：本记录所在提交（`git log --grep="P0-06"`）。
- `docs/OPERATIONS.md` 定义一致快照、恢复前保留故障副本、integrity_check 与数据计数核对，明确未来资料与知识正文一同备份。
- 本机实际通过 SQLite Backup API 将当前库只读快照保存到仓库外临时目录，并恢复到另一临时数据库；integrity_check 为 ok，courses/attempts/review_logs 计数 **3/5/4** 与原库一致。没有覆盖正在使用的数据库。
- 数据库、WAL/SHM、个人数据、密钥、构建日志、浏览器产物均被 Git 忽略；README 改为默认本机命令，ADR-013/014 记录用户追加的本机、减少重复测试和双语要求。
- P0 原始 6 项全部实际验收。继续用户追加的真实模型适配与双语，再进入 P1。

### 2026-10-20 — P0-05 浏览器学习闭环验收
- P0-04 提交 `1a819c6`。本项提交：本记录所在提交（`git log --grep="P0-05"`）。
- Playwright 实际操作：添加文本 → Generate course → Open course → 打开课程 → MCQ 错答与简答正确 → Mark complete；页面状态和持久化均成功。
- 独立标记的 `P0 Acceptance QA` 测试课程：仅该独有概念的 due 被夹具提前，随后两次真实浏览器 `/review` 答题、Again 评分 → Session complete；没有修改用户其他概念的 due。
- Today 展示 Needs attention → Re-teach → 教学面板 → 输入问题 → Ask → Tutor reply 可见。Fake 回答明确标注 fake，未当成真实教学质量。
- 用户在验收过程中要求主要本机运行并减少非必要测试。已停止本项目 Docker 两个服务（保留卷），从已停止容器复制数据库到原先不存在的 `backend/studyforge.sqlite3`，没有覆盖现有本机数据库。
- 本机 `uv sync --extra dev --frozen` 成功、`npm ci` 安装 653 个包成功；`uv run uvicorn app.main:app --host 127.0.0.1 --port 8000` 和 `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1` 已实际启动，Next 就绪 417ms。
- 本机后端回归（含模型适配测试）：**1175 passed, 2 skipped，37.06 秒**；`uv run ruff check app tests` 通过。之后采用最小关键验证，不反复重跑全套。
- 测试课程/模型验收课程已明确命名保留为可审查记录，不冒充个人正式学习成果；浏览器截图/快照均忽略提交。

### 2026-10-20 — P0-04 前端测试与生产构建
- P0-03 提交 `fd1f978`。本项提交：本记录所在提交（`git log --grep="P0-04"`）。
- 修复上游 package-lock 缺失 `@emnapi/core/runtime` 引起的 `npm ci` EUSAGE；未改变 package.json 中的依赖范围。首次 npm 下载 network aborted，增加安装层缓存和下载重试后 `npm ci` 成功。
- 原始前端 `npm test`：**15 files / 124 tests passed**；原始 `npm run build` 成功（Next.js 16.3.3，全部既有路由）。字体获取成功，无需改字体。
- 增加仅服务端 `API_INTERNAL_URL`，浏览器仍用 NEXT_PUBLIC_API_URL，解决容器内 SSR 的 localhost 无法到达后端；两个地址隔离回归测试通过。
- 重建 frontend 镜像，Dockerfile 实际执行 `npm run build && npm exec tsc -- --noEmit` 成功；容器 `npm test`：**16 files / 126 tests passed**，`npm run lint` 和单独 `npm exec tsc -- --noEmit` 均退出 0。
- 依照 frontend/AGENTS 读取已安装 Next.js 的 environment-variables 指南，内部地址不写入 next.config 的公开 env 配置。镜像默认启动生产 `next start`。
- 一次镜像导出返回 EOF，核查镜像已完整存在；后续重建和测试正常。测试/构建日志为本地忽略文件。下一项是实际浏览器验收，尚不将 API 启动等同于使用流程通过。

### 2026-10-20 — P0-03 后端容器基线
- P0-02 提交 `3b7705e`。本项提交：本记录所在提交（`git log --grep="P0-03"`）。
- 新增 Compose、后端/前端 Dockerfile 与构建忽略规则；基础镜像固定摘要，后端 `uv.lock` 固定 48 个包，容器 `uv sync --frozen --extra dev` 成功。后端镜像 Python 3.12.15；SQLite 使用独立命名卷，端口仅映射本机。
- `docker compose run --rm --no-deps -e STUDYFORGE_LLM_PROVIDER=fake backend pytest -q`：**1146 passed, 2 skipped, 2 warnings，68.27 秒**。日志 `pytest-baseline.log` 为被 Git 忽略的本地证据。
- `docker compose run --rm --no-deps backend pytest tests/test_tutor_migration.py -q -rs`：**23 passed, 2 skipped**。两处为按历史 pin 有意跳过不适用断言，历史 Git 对象和迁移比较均已执行；不是环境缺失。
- 容器 `ruff check app tests` 在临时副本中通过；复制 app/tests/evals/pyproject 后规范化 Windows bind mount 的文件权限，避免 Windows 文件全部显示可执行而引发 EXE002；不修改 lint 规则。上游 `evals/run_eval.py` 另有 5 项 E402 bootstrap 基线，未借本次修改关闭检查。
- 网络实际问题：首次镜像下载缓慢，pip 下载 uv 发生读取超时；延长 pip 超时并分离安装层后构建成功。宿主 `python -m pytest -q` 无 pytest，已如实记录，最终验收使用容器。
- 仅测试本项目开发代码，从未执行用户上传程序；未调用真实模型。用户已补充授权使用根 `.env` 测试真实 Agent，后续单独适配 LLM_* 配置并记录结果。

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
