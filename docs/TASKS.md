# TASKS — Codex 分阶段开发清单

> 状态约定：`[ ]` 待办、`[x]` 完成、`[-]` 进行中、`[!]` 阻塞。**文档初始化不意味着源码已经实现。** 每项关闭前必须记录对应测试证据到 PROGRESS.md。

## P0 — 上游基线与环境（必须首先完成）

- [x] P0-01 核查目标本地仓库 HEAD、目录、现有文档与 Git 状态；建立独立工作分支。
- [x] P0-02 阅读现有 StudyForge README / ARCHITECTURE / LICENSE，合并目标文档而非覆盖原文件。
- [x] P0-03 安装后端依赖并运行 `pytest -q`；记录环境、通过/失败/跳过详情。
- [x] P0-04 安装前端依赖并运行 `npm test`、`npm run build`；记录结果。
- [x] P0-05 启动原应用，手工验证课程生成、测验、复习和 Tutor（可使用 fake provider）。
- [x] P0-06 建立测试基线、数据库备份规范、第一份开发进度记录。
- [x] P0-07 接入用户根 `.env` 的 Gemini 网关配置并验证真实 Tutor（用户追加）。
- [x] P0-08 中英双语：默认中文、持久化切换、课程/复习/导师/计划/用量界面与后续 AI 回复语言一致（用户追加；原始资料及已存课程保留原文）。

**完成定义：** 上游能启动，至少自动测试结果可追溯；失败项有明确原因与处置记录。

## P1 — Project 和资源持久化

- [x] P1-01 新建 Project 及 ProjectCourse 模型、迁移、API 与测试。
- [x] P1-02 新建 Project 页面与导航；保留现有 Course 功能。
- [x] P1-03 Resource / ResourceChunk / ProjectResource 持久化，支持 PDF、DOCX、Markdown、URL 基础路径。
- [x] P1-04 SQLite 全文检索与来源定位；实现资源再次打开、删除前引用检查。
- [x] P1-05 测试跨项目共享课程与归档项目不删除学习历史。

**完成定义：** 能创建两个项目并分别关联课程和 PDF，原始资料再次进入后可读取/引用。

## P2 — 本地提交、日志和 AI 评审

- [x] P2-01 设计 Submission/Artifact/CodeReview 数据模型与安全上传接口。
- [x] P2-02 用户在网页手动上传 `.py` 和 `.log`，支持粘贴、历史版本与预览。
- [x] P2-03 添加基础 Python AST 静态检查与限制；**禁止任何用户代码执行**。
- [x] P2-04 扩展 LLM 静态评审提示策略、结构化证据类型与代码审查 UI。
- [x] P2-05 实现一级、二级、三级提示和用户主动查看参考解法。
- [x] P2-06 实现变式题草稿与二次提交关联。
- [x] P2-07 固定广播错误、错误日志/代码冲突、无日志和恶意上传测试。

**完成定义：** 上传 `weights[:,0]` 案例并获得可解释的 Shape 反馈，不出现“服务器已运行”错误宣称。**状态：已验收（提交 `875efd9` 及后续 P2-06 提交）。**

## P3 — Project 自由学习 Agent

- [x] P3-01 设计 AgentSession/Message 与项目知识检索上下文。
- [x] P3-02 实现自由学习页面、提问、论文片段引用和多轮追问。
- [x] P3-03 将现有 Concept Tutor 的教学策略复用为工具/策略，而非破坏其原有接口。
- [x] P3-04 支持根据自由学习问题生成临时讲解与 PyTorch 小练习。
- [x] P3-05 设计上下文长度、模型错误、注入防御与引文正确性的测试。

**完成定义：** 论文 SPDM 问答引用正确来源并生成关联知识草稿；旧 Tutor 仍可用。**状态：已验收（提交 `b34a8ee`、`892faab`、`aa08f91`、`f50becd`、`e7450d8`、`a5a7656` 及后续 P3-05/文档提交）。** 说明：P3 交付的是“引用正确来源 + 关联练习草稿”，知识草稿沉淀属于 P4-01/02，未提前实现。

## P4 — 知识沉淀与跨项目建议

- [x] P4-01 KnowledgeEntry、ProjectKnowledge、Relation、状态和来源记录。
- [x] P4-02 自动生成普通知识草稿及去重候选（不自动覆盖确认稿）。
- [x] P4-03 核心定义/标准答案审核及版本对照 UI。
- [x] P4-04 错因映射到知识点与复习任务；不直接凭 AI 聊天修改 FSRS。已接入评审证据、项目错因界面和不依赖到期日期的主动复习，验收见 PROGRESS 最新记录。
- [x] P4-05 跨项目建议：建议 → 待确认 → 接受/拒绝 → 变更留痕。
- [x] P4-06 测试拒绝建议后目标项目保持不变。

**完成定义：** 论文项目诊断出矩阵乘法漏洞，PyTorch 项目只有用户接受建议后才添加知识驱动复习任务。已通过待确认/拒绝目标零变更、并发接受幂等及事务回滚验收，详见 PROGRESS。

## P5 — 课程与质量整合

- [x] P5-01 构建结构化课程知识树与教材章节映射，支持依赖自适应进阶（无固定天数限制）。
- [x] P5-02 审核核心公式、示例与参考解法；标记 AI 扩展。课时/已揭示解法的版本绑定审核入口与失效保护已完成；2026-10-21 完成基础核心内容实际来源核对：广播/标量索引降轴/列轴保留/unsqueeze/matrix-vector/matrix-matmul 断言对照 D2L 中文版 2.1/2.3 原文与 PyTorch 官方文档逐条验证，5 个白名单章节 URL 全部可达并内容核对，AI 扩展（启发式归纳、unsqueeze 建议）在代码注释中显式标记。验收见 PROGRESS 最新记录。
- [x] P5-03 整体端到端验证三条用户流程。2026-10-21 完成：`backend/tests/test_e2e_flows.py` 3/3 通过（PyTorch 学习闭环 / SPDM 自由学习 / 跨项目补课）；真 HTTP 24/24 通过（临时库 + fake provider）。假模型在 variant/explore/practice 阶段按设计返回 502 且不伪造内容（ADR-018/019 真机验证）。
- [x] P5-04 执行全量 pytest、Vitest、构建和手工回归。2026-10-21 完成：后端全量 **1338 passed / 2 skipped**（清理畸形代理环境变量后；29 个初始失败证实为沙箱环境问题非代码问题）；前端 `npm test` 24 文件 / 178 通过，lint 清洁。修复 Next 16.3.3 移除全局 PageProps/LayoutProps 的 tsc 错误（提交 `ad47e97`），`npm run build` 成功。Playwright 缺席改用 HTTP smoke：`/`, `/projects`, `/usage`, `/review`, `/projects/1` 全 200，`<html lang="zh-CN">`。
- [x] P5-05 完成安装、使用、备份恢复和隐私说明。2026-10-21 完成：README 安装/使用已完整；新建 `docs/PRIVACY.md`（本地 SQLite+资源目录、密钥仅 env/忽略的 .env、上传代码永不执行、模型调用只去用户配置的 provider 且 fake 永不联网、删除语义代码核实、URL 抓取拒私有地址与内网重定向）；README 导航追加 OPERATIONS/PRIVACY 链接。
- [x] P5-06 补齐少量 Today 记忆率说明和后端动态冲突/诊断消息的双语，复核异常态语言切换。2026-10-21 完成：Today 页 RetentionStat 两条英文说明走 t(...)，zh-CN.json 新增 4 键（779 键，含 review/reviews 单复数）；`locale.py` 新增 ERROR_MESSAGES + `localize_error`（8 个冲突/诊断错误码，按请求语言返回），`projects/service.py::project_error` 接入；真机验证 409 `suggestion_decided`、422 `same_project` 中英切换正确；P4/P5 项目页面异常态扫描无 t(...) 外硬编码英文。后端目标测试 72 通过，前端 178 通过。

**完成定义：** 单人可独立使用学习→提交→诊断→复测与论文自由学习两个闭环。

## 后续修复（2026-10-21 起）

已验收行为的缺陷修复，均在 PRD 范围内（P2 评审准确性 / P3 检索质量），不扩张范围。

- [x] FIX-01 评审行号偏差：`_prompt()` 给模型的代码块加 `N|` 行号前缀，`REVIEW_SYSTEM` 规则 4 要求引用打印出的行号。2026-10-21 完成并测试（`test_review_prompt_numbers_code_lines_for_the_model`），测试记录 `docs/test-reports/2026-10-21-review-line-numbers-cjk-retrieval.md`。
- [x] FIX-02 中文长问句检索不到资料：`expand_cjk_search_terms()` 把 ≥4 字连续 CJK 展开为重叠二元词；`search_resources_fts()` 在 FTS 无命中且含中文时走按命中词数排序的 LIKE 兜底；`retrieval.py::_terms()` / `_like_fallback()` 同步。2026-10-21 完成并测试（4 个新增用例），测试记录同上。未引入分词依赖。

## 优先级及依赖约束

`P0 → P1 → P2 → P3 → P4 → P5`。允许同阶段并行的只读分析，但不得提前重构尚未验证的下游接口。Codex 负责自身任务拆解；用户仅在边界冲突、付费、凭据或无法恢复的操作时参与决策。

## 任务更新规范

### 2026-10-23 恢复优先（用户最新要求）

- [x] REC-01：以刚同步的 `main`/`origin/main` `29b0265` 为基线，撤回本次既有工作台组件和全局主题改动；保留用户知识页宽度修改，后端/API/类型定义不改。恢复检查见 PROGRESS 与 `test-reports/2026-10-23-main-alignment.md`。
- [x] REC-02：恢复课程生成的持久审查/续跑、任务链路实际返回与查看；后端68项、前端8项恢复回归及真实浏览器流程通过，见 generation-trace-recovery 报告。
- [x] UI-01：功能恢复验收后，完成首页/工作台双主题，默认浅色并记住手动选择；独立浅色首屏、深色球体自动动画、艺术字体课程滚动、课程卡片/图谱/AI 链路适配。生产构建通过，测试证据见 `test-reports/2026-10-23-dual-theme.md`。
- [x] BRAND-01：双主题提交 `eb6131f` 后，完成「知径 MindTrail」名称、书页路径 SVG Logo、favicon、界面/元信息/API 名称和 README；原 MIT/上游 README 保留。验收见 `test-reports/2026-10-23-mindtrail-brand.md`。

### 2026-10-23 质量收敛（用户要求"都做"）

- [x] QA-01：清理前端长期遗留的 43 个失败用例与 lint 收敛。逐条区分"真实代码缺陷"与"断言过期"：修 10 处真实缺陷（课程打开计数并发丢更新、`/variant` 同步端点失联、antd `Alert` 双 live region 与 `{nativeElement}` ref 转发、`Field` 缺 `htmlFor`、`PageHeader` 缺 h1、`DeleteCourseButton` 描述关联与删除中文案、`MarkCompleteButton` 缺 `group`、`ProjectWorkspace` 缺 `aria-label`、UI 组件库 `@ts-nocheck`/`any` 收口），其余改写为断言当前真实契约。实际结果：`npx vitest run` 185/43 → **229 passed / 0 failed**，`npx tsc --noEmit` 通过，`npx eslint .` 14 errors/33 warnings → **0 errors / 28 warnings**。未删功能、未降规则、未跳用例。验收见 `test-reports/2026-10-23-frontend-suite-green.md`。
- [x] QA-02：后端全量 pytest 基线。阻塞已解除（并发批次的 `conftest.py` provider 桩已接受 `images`），**全量已跑通：1452 tests / 0 failed / 0 errors / 2 skipped**（`--junitxml` 报告为准，见 PROGRESS 2026-10-23 收口节）。过程中定位并修掉 3 项失败：`jobs/router.py::cancel_job` 漏传 `session` 导致取消接口 500（真实回归）、`test_ai_dedupe.py` 两处全局计数被其他文件的作业行污染、`test_agent_cross_course.py` 遗留的真实 provider 后台作业占满两线程池导致后续用例"永不完成"。
- [!] QA-03：本机 `npm run build`。沙箱批量删除保护拦下 `.next/turbopack` 清理，与代码无关；需在放行环境或 Docker 中验证。上一轮 `c0ee77b` 的 Docker 生产构建为通过。
- [ ] QA-04：剩余 28 条 lint warning（未使用变量/导入等），本轮已清 5 条，其余待清。

### 2026-10-23 用户反馈修复

- [x] TZ-01：时间全部改为北京时间（用户反馈「所有的时间都不是北京时间」）。三处独立缺陷：`days.DEFAULT_TIMEZONE` 默认 UTC 导致 04:00 学习日边界落在北京中午；`jobs/router.py::_out` 直接 `.isoformat()` 输出无偏移字符串导致任务列表慢 8 小时；前端 10 处各自 `toLocaleString()`、`formatDay` 硬编码 `timeZone: "UTC"` 导致日期与 SSR 不一致。修复：后端默认 `Asia/Shanghai` + 三份配置显式写出，`_out` 改用 `iso_utc()`；前端新增 `APP_TIMEZONE` / `formatDateTime()` / `dayKeyOf()` 统一收口（日键仍固定 UTC）。存储层不动，历史学习日不重算。验收见 PROGRESS 2026-10-23 记录与 ADR-032。

### 2026-10-23 课程页三栏 / 题库独立页 / 资料弹窗 / AI 防重

- [x] UI-01：`/courses/[id]` 改三栏（题目左、课时中、问答与进度右），题目跳转到独立页 `/courses/[id]/quiz`；`CourseQuizBank.tsx` 带章节目录与可折叠章节，`QuizGenerateDialog.tsx` 为课时页与题库页共用的唯一出题弹窗。
- [x] UI-02：`ResourceAddDialog.tsx` 取代资料列表下方三套内联表单（文件/文本/链接用 `Segmented` 切换）；`AttachmentInput.tsx` 从"输入框内 chip"改为输入框下方列表式上传区（按钮 + 提示 + 每行 `图标/文件名/对勾/删除`）。
- [x] AI-01：全量 AI 接口防重（用户反馈「答案解析能反复生成，要检查是否还有 AI 任务能刷新重试」）。新增 `jobs.service.find_live_job()`，13 个入口逐一审计、补齐 11 处守卫；答案分析改为**每次作答只生成一次**（作业行即缓存，`progress.attempt_id` 覆盖双击窗口、`result.attempt_id` 覆盖完成后再次点击）；变式题 ref 从 course 改为题目；提示按 (题, 级别) 匹配。决策见 ADR-033。
- [x] AI-02：刷新不重置加载（用户要求）。`QuizSection` 挂载时从 `/api/jobs` 找回仍在 `pending/running` 的解析/分析/判分作业并继续轮询；新增 `useResumeJob()` 让两个重生成按钮自动恢复进度弹窗；任务列表的"打开"改为服务端下发 `href`（`jobs.router._link_for()`），覆盖全部可跳转任务类型。
- [x] QA-05：本批次回归收口。修掉 `cancel_job` 漏传 `session` 的真实 500；`test_ai_dedupe.py` 断言按 `(type, ref_type, ref_id)` 收窄、分析用例改为手工完成作业（不再依赖两线程池）；`test_agent_cross_course.py` 加 autouse fixture 屏蔽图谱提取的真实模型调用（该调用会永久占满线程池）。最终：后端 **1452 / 0 failed / 2 skipped**，前端 **42 文件 / 244 passed**，`tsc` 通过，`eslint .` 0 problems。
- [ ] QA-06：测试的 provider 注入是逐模块 monkeypatch，`project_graph/service.py`、`concept_extract/service.py`、`submissions/llm_*.py` 等模块在**模块级** `from app.llm import get_provider`，patch `app.main` 覆盖不到。任何走到这些后台作业的用例都会打真实模型；沙箱无外网时调用挂住，会把只有 2 个线程的作业池永久占满，表现为几个文件之后某个毫不相干的用例「作业永不完成」。本轮只堵了已确认泄漏的一处，全局方案（例如把这些模块改为调用时取值 `llm.get_provider()`，或在 conftest 统一注入）需要先评估对成本/用量断言的影响，单独一轮做。

当 `TASKS.md` 中条目完成：记录对应 Git commit、修改路径、测试命令/结果和剩余风险到 `PROGRESS.md`；必要时更新 `DECISIONS.md`。发现新需求先判断是否属于 PRD 范围，再加任务，不能悄悄扩张范围。


### 2026-10-23 问答界面主题统一

- [x] UI-QA-01：在最新 main `cc89525` 上，仅调整共享问答和课程问答卡片的展示；统一亮/深主题按钮、输入区、分隔线和对话来源分区，保留当前课程/课时 scope、历史、引用、引导思考、限额、快捷键与焦点恢复。Docker 全量前端 43 文件 / 248 passed，lint、tsc、生产构建通过；1440/390 浏览器通过。详见 `test-reports/2026-10-23-qa-theme.md`。


### 2026-10-24 单人密码登录

- [x] AUTH-01：`ADMIN_PWD` 密码登录、首页外页面门禁及后端全部业务 API 认证；15 分钟 access + 固定 7 天 refresh、持久化会话、退出撤销、改密失效、限流和跨站写入防护。登录页复用首页背景动画及双主题/双语言。
- [ ] AUTH-02：最终完整回归与真实浏览器验收。用户要求停止测试并直接提交；已停止进行中的完整回归。已完成的局部验证与构建只对执行当时的代码树有效，详见 PROGRESS。
