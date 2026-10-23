<p align="center"><img src="frontend/public/brand/mindtrail-mark.svg" width="88" height="88" alt="知径 MindTrail Logo" /></p>

# 知径 MindTrail

**连接知识，走出自己的学习路径。**

私有服务器部署可使用 [原生 Linux / systemd 部署说明](docs/DEPLOYMENT.md)，支持一次性迁移本地数据库与资料。

MindTrail 是一个本地自托管的个人 AI 学习工作台。围绕真实项目整理课程、论文、代码和问题，在「学习 → 本地实践 → 上传证据 → AI 评审 → 针对性练习 → 知识沉淀」中持续推进。

项目从 [StudyForge](https://github.com/Akhilvallala1/studyforge) 演进，保留课程、测验和复习能力，扩展了项目资源、自由学习、代码与日志静态评审、知识审核、跨项目建议和可恢复的 AI 任务流程。原作者版权及 MIT 许可证完整保留。

## 可以做什么

| 能力 | 使用方式 |
| --- | --- |
| 按项目组织学习 | 创建或归档项目，关联课程，保存资料与会话，从项目进入课程知识树和学习顺序图。 |
| 生成并审阅课程 | 从主题或学习材料出发，选择自动、提纲或全量审查；对提纲与章节提出修改意见，逐步确认。 |
| 随时接续 AI 任务 | 任务在后台处理；刷新、离开页面后，从 AI 任务页返回继续审查、查看进度、重试或取消。 |
| 查看调用链路 | 查看实际执行阶段、模型调用、返回摘要及调用 ID；记录独立滚动，输入输出可展开。 |
| 在本地实践 | 使用自己的 IDE 运行代码，上传代码、文本或运行日志；平台做解析、静态分析与 AI 评审。 |
| 带着问题自由学习 | 在项目资料与关联课程上下文中提问，查看来源，获取分级提示和补充练习。 |
| 沉淀与审核知识 | 保存有来源的草稿、记录错因，审阅核心知识和参考内容，保留版本及审核状态。 |
| 根据证据继续学习 | 查看知识掌握情况、主动复习，确认跨项目建议后再加入目标项目。章节完成不等于知识已掌握。 |

界面默认简体中文，可切换 English；后续 AI 请求传递当前语言，已保存资料保留原文。首次访问使用浅色主题，也可切换深色并记住选择。浅色首页采用自然影像与居中排版，深色首页采用球体滚动叙事，两者共享工作台功能。

## 开始使用

需要 **Python 3.11+、uv、Node.js 24 和 npm**。前后端分别运行，默认端口为 8000、3000。

后端，在仓库根目录打开 PowerShell：

```powershell
cd backend
uv sync --frozen --extra dev
if (!(Test-Path .env)) { Copy-Item .env.example .env }
$env:STUDYFORGE_LLM_PROVIDER = "fake"
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

前端，另开一个 PowerShell：

```powershell
cd frontend
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.local.example .env.local }
npm run dev -- --hostname 127.0.0.1 --port 3000
```

打开 [学习工作台](http://localhost:3000)，或查看本机 [API 文档](http://localhost:8000/docs)。

上述 `fake` 配置不需要密钥，适合离线测试与接口验收；它不能替代真实教学模型，也不保证覆盖每一种生成模式。日常 AI 学习请按下一节配置供应商，再重启后端。

也可在已安装 Docker Compose 的环境中运行：

```powershell
docker compose up --build -d
docker compose ps
```

Compose 默认使用 fake，学习数据库位于持久命名卷 `learning-data`。请先停止占用相同端口的本机服务。保留该卷即可保留数据库；备份和回滚见 [运行维护](docs/OPERATIONS.md)。

## 配置模型与数据

配置示例：[backend/.env.example](backend/.env.example)、[根目录 .env.example](.env.example)、[frontend/.env.local.example](frontend/.env.local.example)。真实密钥仅放后端环境变量或被 Git 忽略的 `.env`。

| 配置 | 含义 |
| --- | --- |
| `STUDYFORGE_LLM_PROVIDER` | `anthropic`、`ollama`、`gemini`、`openai` 或 `fake`。`gemini`/`openai` 使用 OpenAI 兼容 Chat Completions 网关。 |
| `ANTHROPIC_API_KEY`、`STUDYFORGE_MODEL` | Anthropic 的密钥与模型。 |
| `OLLAMA_BASE_URL`、`OLLAMA_MODEL`、`OLLAMA_NUM_CTX` | 本地 Ollama 地址、模型与上下文窗口。 |
| `LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY` | OpenAI 兼容网关的 HTTPS 地址、模型和密钥。 |
| `STUDYFORGE_DB` | SQLite 路径；本机默认相对于后端工作目录，为 `backend/studyforge.sqlite3`。 |
| `STUDYFORGE_DATA_DIR` | 原始资料目录；默认相对于后端工作目录，为 `data/resources`。 |
| `STUDYFORGE_COST_LIMIT_USD` | 可选费用上限；费用为估算值，具体语义见后端配置示例。 |
| `STUDYFORGE_CORS_ORIGINS` | 允许访问 API 的前端来源，默认 `http://localhost:3000`。 |
| `NEXT_PUBLIC_API_URL` | 浏览器访问的 API 地址，默认 `http://localhost:8000`。 |
| `API_INTERNAL_URL` | 可选，前端服务器访问后端的内部地址；Compose 使用 `http://backend:8000`。 |

配置优先级为：进程环境变量 → `backend/.env` → 根目录 `.env`。`STUDYFORGE_LLM_PROVIDER` 优先于兼容配置 `LLM_PROVIDER`。如使用已有网关配置，注意移除或修改后端示例中的 `anthropic` 设置，以及当前终端中测试用的 `fake` 环境变量。

名称已更新为 MindTrail；为保持已有数据库、脚本和浏览器偏好兼容，`STUDYFORGE_*` 环境变量、数据库默认文件名、Cookie 和内部包名继续沿用。改名不会迁移或重置学习数据。

## 一个完整的学习流程

1. 在「项目」中创建学习目标，关联课程或上传资料。
2. 打开课程知识树，选择章节；也可以从项目会话自由提问。
3. 使用本地 IDE 编写并运行代码，手动上传代码与运行结果。
4. 查看静态评审、来源与分级提示，定位问题后在本地修正。
5. 用补充练习或复测形成新证据，整理知识草稿并审核核心内容。
6. 根据错因与掌握情况选择下一步；涉及其他项目的建议先确认再执行。

课程生成时可切换到「AI 任务」查看链路，从「继续审查」返回同一个持久任务。调用链路记录实际阶段与输入输出摘要，不展示模型内部思维链。

## 数据与使用边界

- 面向单人、可信本机使用，无登录体系；服务默认绑定本机，不应直接公开到不可信网络。
- 上传的代码不会在服务器执行。运行日志是用户提供的证据，不能视为平台实测结果。
- 配置远程模型后，相关提问、资料片段或评审内容会发送给该供应商。使用前请确认资料适合分享；详见 [隐私说明](docs/PRIVACY.md)。
- AI 生成内容需要核实。普通笔记、章节完成、自评和一次对话不代表正式掌握；核心知识、参考答案及覆盖已确认内容需审核。
- 升级前备份 SQLite 及原始资料；活跃数据库使用一致性备份，不能只复制主文件。不要提交数据库、资料、日志或密钥。

## 技术与工程状态

前端为 Next.js 16 / React 19 / TypeScript / Tailwind CSS，复用 Ant Design、React Vant 与 ECharts；后端为 FastAPI / SQLAlchemy / SQLite。没有在线 IDE、服务端用户代码执行或云 GPU 调度。

```text
frontend/src/app/          页面、SSR 与应用入口
frontend/src/components/   工作台、课程、知识与主题组件
frontend/src/lib/          API 契约、语言、主题与品牌配置
backend/app/               课程、项目、资料、评审与任务服务
backend/tests/             后端与安全边界回归
docs/                      产品、架构、决策、维护与测试证据
```

标准检查：

```powershell
# backend/
uv run pytest -q
uv run ruff check app tests

# frontend/
npm test
npm run lint
npm exec tsc -- --noEmit
npm run build
```

截至 2026-10-23，课程生成/任务恢复的后端定向回归为 68 passed；首页、主题和课程流程定向验证为 26 passed，前端类型检查与生产构建通过。完整前端测试及 lint 仍有历史失败，未宣称所有检查通过。最新结果以 [进度记录](docs/PROGRESS.md) 和 [测试报告](docs/test-reports/2026-10-23-dual-theme.md) 为准。

## 文档

- [产品需求](docs/PRD.md) · [系统架构](docs/ARCHITECTURE.md) · [技术决策](docs/DECISIONS.md)
- [任务与验收](docs/TASKS.md) · [真实进度](docs/PROGRESS.md) · [运行、备份与恢复](docs/OPERATIONS.md)
- [隐私说明](docs/PRIVACY.md) · [开发协作规范](AGENTS.md)

## 许可与致谢

MindTrail 基于 Akhil Vallala 的 [StudyForge](https://github.com/Akhilvallala1/studyforge) 发展，遵循 [MIT License](LICENSE)，保留 `Copyright (c) 2026 Akhil Vallala` 及必要许可声明。上游 README 保存在 [docs/upstream/README.md](docs/upstream/README.md)。

MindTrail 的 SVG Logo 以书页和向上延伸的路径组成，表示从知识走向实践。字体各自遵循 SIL Open Font License；浅色首页的远程视频来自用户提供的设计参考，不包含在本仓库的 MIT 授权内。完整来源与版权边界见 [NOTICE.md](NOTICE.md)。
