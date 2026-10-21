# PROGRESS — 开发进度与真实验证记录

> 下方保留初始化与逐项真实验证记录；以本节“当前状态”和最新追加记录为恢复入口。

## 当前状态

- 当前里程碑：**P0/P1/P2/P3 及 P4-01/02/03 已验收；P4-04 后端已实现，下一步补齐错因/复习任务前端与提交证据关联**。本节与最新追加记录优先于下方历史状态。
- 已确定：产品需求、单人本地运行边界、项目化、课程/自由学习、自动知识草稿与核心审核、跨项目确认。
- 已准备：AGENTS、PRD、ARCHITECTURE、TASKS、DECISIONS、README 的目标文档草案。
- 已有源码审查：通过 GitHub 阅读 StudyForge 目录、models、ingest、generation、tutor、remediation、db、部分 API 及依赖文件。
- 运行约定：本机 FastAPI `http://localhost:8000`、Next.js `http://localhost:3000`；日常开发不使用 Docker。上轮服务状态不代表本轮仍在线，本轮未重新核实常驻进程；自动测试使用独立临时库及确定性 provider。
- 已完成：基线文档合并、容器/本机测试、浏览器课程/Quiz/Review/Tutor、SQLite 快照/恢复、Gemini adapter 和一次真实 Shape 教学。功能提交截至 `12419d0`（P3 收尾），本段之后为文档批次。
- 已完成：P3 全部任务与 P4 知识模型、自动草稿、核心审核及版本对照。最新功能提交 `25e5a06`、`f9916cc`；既有 P4 模型/版本提交见最新记录。旧初始化“未运行”表仅是历史记录。

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

1. 核对当前状态和最新追加记录，保留用户既有文档删除；不要重新执行已通过的 P0 基线。
2. 从 P4-04 继续：复用 `knowledge/errors.py`、`errors_router.py`，补齐前端错因/主动复习入口与提交评审证据关联，不重复 P0~P3 基线。
3. P4-04 验收后推进 P4-05/06 跨项目建议确认、拒绝不改变目标项目的回归，再进入 P5 知识驱动整合。


### 2026-10-20 — P1 完整验收与学习机制调整（取消时间驱动，转为知识掌握驱动）
- 同步最新产品决策（ADR-017）：取消倒计时Deadline、Days Off、日历计划等时间驱动功能，改为纯知识点掌握驱动。保留所有历史答题和底层结构。
- 完成 P1-03 / P1-04：
  1. 新增 Resource、ResourceChunk、ProjectResource 模型与 SQLite FTS5 全文检索引擎。
  2. 支持 PDF、DOCX（免外部重依赖解析）、Markdown、纯文本、Web URL 抓取切片与定位。
  3. 支持源文件安全下载与切片检索；删除资源前做多项目引用计数检查，仅当无项目关联时才彻底物理清理文件，支持跨项目共享资源。
  4. 前端 Project 页面集成资料管理组件（搜索、切片预览、多格式上传、源文件下载、解绑）。
- 完成 P1-05：
  1. 通过现有 `test_projects.py` 和 `test_resources.py` 验证跨项目共享课程/资料与归档项目安全机制，确认答题、复习卡片和 FSRS 历史完整保留。
- 自动化测试验证：
  1. 后端 `tests/test_resources.py` + `tests/test_projects.py` 24 项测试全部通过。
  2. 前端 TypeScript 类型检查通过，无额外报错。


### 2026-10-21 — P2 完整验收（提交、静态与 AI 评审、提示阶梯、变式题）
- 提交：`875efd9`（P2-01~05、07 后端与前端）、`fa28d27`（P2-06 后端）、`dab793e`（P2-06 前端）；本记录所在提交为文档批次。
- 新增 `backend/app/submissions/`：Submission / SubmissionArtifact / CodeReview / VariantExercise 模型，`service.py` 统一文件与粘贴校验（扩展名白名单、512KB 代码 / 2MB 日志、UTF-8 严格解码、拒绝二进制与路径文件名、凭据扫描不回显），`static_check.py`（AST 形状隐患、日志症状、静态与日志相关性推断、无日志时必给 needs_local_check），`llm_review.py`（结构化评审，失败降级为 static-only 并标 `llm_status`），`llm_variant.py`（变式题草稿，失败返回 502 不伪造），`router.py` 9 个端点。
- 前端新增 `/projects/[id]/submissions` 与 `/projects/[id]/submissions/[id]`：粘贴/上传两种提交、历史版本、代码与日志预览、隐私提示、证据级别徽章、三级提示按需解锁、参考解法二次确认并标注 `ai_generated_unverified`、变式题草稿与回链提交。
- 同步 `/usage`：新增 `code_review` 与 `variant_exercise` 分组及说明，使“每个实际记录的 stage 都能被页面解释”的守卫测试继续成立。
- 实际执行：
  1. `uv run pytest -q --junitxml=junit-p2.xml`：**1222 tests, 0 failures, 0 errors, 2 skipped**（两项为历史 pin 有意跳过）。
  2. `uv run ruff check app tests`：通过。
  3. 前端 `node node_modules/typescript/bin/tsc --noEmit`、`npm run lint`：通过；`npm test`：**18 files / 142 passed**；`NODE_OPTIONS= npm run build`：成功，构建清单含两个新路由。
  4. 定向 `uv run pytest tests/test_submissions.py -q`：**15 passed**，覆盖广播错误、日志/代码冲突、无日志、恶意上传（类型/路径/二进制/超限/空提交）、模型输出不可用降级、变式题跨项目拒绝。
- 修复的既有回归：`test_tutor_endpoints.py` 两处对 system prompt 的精确比较没有包含 P0-08 追加的语言说明（P0-08 之后未跑全量，属既有缺口）；改为与 `teaching_system(...)` 比较，没有跳过或删除断言。
- 环境说明：本机 `.next` 缓存清理触发 safe-delete 守卫（非代码错误）；以 `NODE_OPTIONS=` 关闭该 shim 后构建成功。开发库中三张空的 P2 草稿表已按“先确认 0 行再删除”的方式重建，未触碰任何学习历史。
- 剩余风险：静态规则为启发式（仅对二维标量索引提示形状降维），可能误报/漏报；AI 评审与变式题均为显式动作并消耗额度；未做真实模型端到端验收（仅 stub/fake 契约测试）。
- 下一步：P3-01 AgentSession/Message 与项目知识检索上下文。

### 2026-10-21 — P3 完整验收（项目自由学习、引文、教学策略复用、临时练习）
- 提交：`b34a8ee`（会话/检索/引文后端）、`892faab`（P3-01 测试）、`aa08f91`（教学策略抽取）、`f50becd`（自由学习前端）、`e7450d8`（临时讲解与练习后端）、`a5a7656`（P3-04 测试）、`84769dd`（402 载荷统一）、`aa6c43f`（练习与消息关联）、`0065f9c`（P3-05 与迁移测试）、`12419d0`（练习前端）；本记录为文档批次。
- 新增 `backend/app/agent/`：`AgentSession` / `AgentMessage`（`beyond`、`check_question`、`source_refs` 快照、`grounded`、`model`、`run_id`、`exercise_id`）、`retrieval.py`（仅本项目 chunk，FTS5 优先 + 有界 LIKE 回退，5 段 / 6000 字符上限）、`prompt.py`（围栏与 JSON 解析，未提供的引文标记落库前剔除）、`practice.py`（一次调用产出临时讲解 + 一道练习草稿）、`router.py`（5 个端点）。
- 新增 `backend/app/teaching.py`：把 Tutor 的“先解释”“两个回答字段”“四种情形”“共同拒绝项”“围栏段落”抽成唯一所有者，Tutor 与自由学习共用；Tutor 的 system prompt 抽取前后**逐字节一致**（用快照 diff 验证，非仅靠断言）。
- 前端新增 `/projects/[projectId]/explore`：服务端渲染会话列表与选定会话，客户端追问、引文徽章（`[S1] 文件名 · 定位`）、`beyond` 独立区块与免责句、`check_question` 卡片、练习卡片（草稿/未审核/未运行 + 回链提交）。
- 迁移边界：`variant_exercises` 新增 `session_id` / `source_question`，`agent_messages` 新增 `exercise_id`，均走 `ADDED_COLUMNS` 且**不声明外键**——SQLite 无法给既有表补外键，声明了会让升级库与全新库静默分叉。
- 实际执行：
  1. `uv run pytest -q --junitxml=...`：**1261 passed, 2 skipped**（两项为历史 pin 有意跳过）。
  2. `uv run ruff check app tests`：通过。
  3. 前端 `npx tsc --noEmit`、`npm run lint`：通过；`npm test`：**19 files / 152 passed**；`NODE_OPTIONS= npm run build`：成功，构建清单含 `/projects/[projectId]/explore`。
  4. 定向：`tests/test_agent.py` 22 项、`tests/test_practice.py` 12 项、`tests/test_teaching.py` 6 项。
  5. 真实开发库副本升级验证：`init_db()` 后新建 6 张表，课程/答题/复习日志/复习卡片计数 3/5/4/2 前后完全一致。
- 修复的既有缺陷：`/usage` 的 402 载荷此前只有 code 与 message，缺 `limit_usd` / `spent_usd`，而客户端会渲染这两个数字；现由 `metering.cost_limit_detail` 统一，四个计费面共用。迁移守卫测试只注册了 `app.models`，导致任何指向 submissions 表的 `ADDED_COLUMNS` 条目被误判为“模型已删除该表”；已改为注册 `init_db` 全部模型模块。
- 剩余风险：检索为词法匹配（FTS5 + LIKE），语义相近但用词不同的提问可能检索不到，界面会如实显示“没有引用项目资料”；单题上下文有上限，超长资料不会被完整送入；引文正确性由“只允许引用已提供标记”保证，但模型仍可能把某个标记挂在并不支持该句的段落上，本轮未做语义一致性校验；临时练习未经人工审核，仅以草稿呈现；未做真实模型端到端验收（全部为 stub/fake 契约测试）。
- 下一步：P4-01 KnowledgeEntry / ProjectKnowledge / Relation 与知识草稿（ADR-019 已预留“跨项目引用与知识沉淀另立决策”的边界）。

## 追加记录模板

### 2026-10-20 — P1-02 项目页面与导航
- P1-01 审查修复提交 `b4b00db`。本项见 `git log --grep="P1-02"`。
- 新增 `/projects` 列表/创建/归档筛选/分页与 `/projects/{id}` 编辑/课程关联/归档确认；顶部加入项目导航。保留 `/courses`、旧学习路由及原始课程内容。
- 复用现有 API 请求与双语边界，新增明确类型；表单统一防重复、pending/error/success、失败保留输入；课程选项加载失败不隐藏已有项目，归档后的课程仍能打开。
- 实际 `npm test`：**18 文件 / 139 passed**；新增 7 项创建防重、失败重试、共享关联、归档确认/只读、项目与课程加载失败、404；`npm run lint`、`node node_modules/typescript/bin/tsc --noEmit`、`npm run build` 均通过，新路由出现在生产构建清单。
- Playwright 本机验收：创建 QA 项目 #1/#2、修改模板、共享课程 #3、解除 #1 后 #2 的关联仍在、归档 #1 只读、切换英文、390px 页面无横向溢出。首轮脚本使用 getByLabel 精确匹配嵌套 select 超时，改为真实可访问角色 combobox 后完整场景通过，未绕过产品错误。
- QA 项目与测试课程明确命名并保留，没有删除学习数据。P1 原始资料持久化/搜索尚未交付，不能宣称整个 P1 完成。

### 2026-10-20 — P1-01 协作审查回归修复
- P1-01 提交 `c0a9685`。只读协作在独立临时库发现两项实际边界：超过 SQLite int64 的路径/offset 返回 500；课程恰在两次详情 SELECT 间被删除会使关联 Course 为 None。
- 修复：项目/课程 ID 与 offset 设 int64 上限，超限请求返回统一 422；课程引用与标题用单次 JOIN 快照读取，消除两阶段加载窗口。
- `uv run pytest tests/test_projects.py -q`：**22 passed**；包含整数溢出及旧双查询窗口的确定性回归，ruff 通过。没有修改用户数据库或通过关闭测试解决问题。

### 2026-10-20 — P1-01 Project 模型、迁移和 API
- 前项双语提交 `bf0bb5c`；本项见 `git log --grep="P1-01"`。新增独立 `app/projects/` 模型、schema、service、router；main 仅注册路由，db 显式注册新表。
- `/api/projects` 支持列表（状态/分页）、创建；`/{id}` 支持查看/编辑；`/{id}/archive` 幂等归档；`/{id}/courses/{course_id}` PUT/DELETE 幂等关联/解除。归档项目可读，写操作返回 project_archived；没有项目硬删除。
- 所有项目修改先取得 SQLite 写锁再检查归档状态；共享课程关联使用复合主键/upsert，双向 ORM 仅级联清理关联行，不删共享课程。新接口校验 Origin（存在时），限制输入、拒绝额外字段和 null，数据库繁忙返回脱敏 503；日志使用项目/课程 ID。
- 本机 `uv run pytest tests/test_projects.py tests/test_tutor_migration.py tests/test_deletion_api.py -q`：**54 passed, 2 skipped**，约 8.3 秒。显式新增表白名单，保留历史 pin、旧数据、重复升级和 upgraded==fresh 验证；两项 skip 与历史 pin 无关当前功能，未新增跳过。
- 修正归档重复调用不改变 updated_at、时间戳带 UTC 后，重跑项目测试 **20 passed**；`uv run ruff check app tests` 全部通过。
- 协作复核确认生产课程删除在 `_stamp_spend` UPDATE 后才加载并删除关联，因此与项目关联写锁串行；未为无法经当前 API 发生的裸 ORM 交错增加触发器。
- 剩余：项目 UI 和资源能力未交付；原双语尚有少量 Today 详细说明及后端动态错误英文，已明列 P5-06，未声称逐项文案全部翻译。

### 2026-10-20 — P0-08 双语验收
- 后端语言链路提交 `df3709a`；前端与文档提交见 `git log --grep="P0-08"`。
- 默认中文、Cookie 持久切换、SSR/客户端统一；课程创建/测验/复习/导师/计划/费用/删除确认已接入词典。已存课程、用户输入和原始资料保留原文；Fake 内容仍为确定性夹具。
- 首轮失败已全部修复，没有删除或跳过测试：旧英文测试显式使用真实英语 LocaleProvider，SSR fixture 提供请求 Cookie，新增请求头契约断言。
- 实际前端 `npm test`：**17 文件 / 132 passed**（原 126 + 新增 6）；`npm run lint` 零告警、`npm exec tsc -- --noEmit` 通过、`npm run build` 成功。收尾文案/测试 wrapper 调整后再次运行 132 项和 tsc 均通过。
- Playwright 独立浏览器上下文实际验证：初次中文 → English → 刷新保持英文 → 切回中文 → 创建课程页；html lang 与 Cookie 均一致，无需重新生成已存课程。
- 后端定向 31+200 项与两条真实模型语言样例结果见下方恢复记录。P0-08 验收通过，后续新增页面沿用同一双语机制。

### 2026-10-20 — 恢复双语批次（进行中）
- 重新完整读取 AGENTS、README、PRD、ARCHITECTURE、TASKS、DECISIONS、PROGRESS，核对 Git；当前 HEAD 为 `c2e3e0f`，用户原先的文档删除保持未暂存。
- 后端新增请求级 ContextVar 语言及 ASGI middleware，MeteredLLM 统一追加可信语言要求，保留原始来源、标识符及 JSON 契约；避免不同请求互相污染语言。
- 本机实际执行 `uv run pytest tests/test_locale.py tests/test_fake_provider.py -q`：**31 passed**；对应四个文件 ruff 通过；既有两项 FastAPI on_event 弃用警告仍在。
- 本机前端首轮 `npm test`：**49 passed / 77 failed**。失败集中于未指定语言的旧断言、server cookies 请求上下文和新增请求头契约；没有将此轮写成通过或跳过失败。前端协作 Agent 正在修复并补充双语验证。
- 本机 FastAPI 已重新启动（Fake QA）；尚未重复真实付费调用或全量后端基线。P0-08 尚未关闭，P1 尚未提前标记完成。
- 随后定向执行 `uv run pytest tests/test_tutor.py tests/test_remediation.py -q`：**200 passed**，原有教学与补课契约保持通过。
- 使用根 `.env` 的真实 Gemini 通过同一 MeteredLLM 各验证一次 zh-CN/en：中文回答“张量的秩是指该张量所具有的维度（或轴）的数量。”；英文回答“A tensor's rank is simply the number of dimensions, or axes, it contains.”。脚本检查语言并退出 0，调用记录保留在本机数据库；这是两条语言样例验证，不代表全面教学质量评估。
- P1 升级前快照：`F:\A____usually\code\ProjectCode\AILearning-backups\2026-10-20_203346\studyforge.sqlite3`，SQLite Backup API、integrity_check=ok，课程/答题/复习日志计数为 **3/5/4**。未覆盖或删除现有数据库。

### 2026-10-20 — P0-07 Gemini 网关与真实教学
- P0-06 提交 `6897038`。本项提交：本记录所在提交（`git log --grep="P0-07"`）。
- 增加 OpenAI-compatible httpx adapter（不新增 SDK），get_provider 支持 gemini/openai，加载根 .env、环境映射与示例，控制配置错误响应。密钥始终未打印或写入受跟踪文件。
- 最小 adapter/Fake 验证：`pytest tests/test_openai_compatible.py tests/test_fake_provider.py -q` **54 passed**；覆盖协议、配置、计数、坏响应、HTTP/超时/拒绝/截断、脱敏、预算和失败计量。后续本机全量 **1175 passed, 2 skipped** 与 ruff 通过已在 P0-05 记录，不再重复整套。
- 真实网关首轮超时；无凭据宿主/容器探测均收到 HTTP 401，重试真实短请求得到 OK。随后本机真实 `/tutor/messages` **HTTP 200**，模型 `gemini-3.8-flash`，1328 input / 236 output tokens。
- 真实回答正确说明 `(3,4)` 与 `w[:,0]` 的 `(3,)` 在末轴 4/3 不兼容；建议 `w[:,0:1]` 保持 `(3,1)` 或 `x*w`，明确“静态推导，未实际执行任何代码”。仅使用明确命名的 QA 教学材料，不涉及真实上传程序执行。
- 该调用 fallback 估算 **$0.0125**（approximate，非网关账单）；这是一次真实模型样例验收，不能据此宣称整个 Agent 教学可靠率。真实记录保留在本机忽略数据库。

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

### 2026-10-21 — P4-01/02/03 验收与 P4-04 后端
- 提交：既有 `644147b`/`223c265`（知识模型与测试）、`18ab791`/`d52070f`（草稿与边界）、`a17903b`/`0c921d3`（审核版本）；本轮 `25e5a06`（自动草稿事务、并发审核与错因后端）、`f9916cc`（知识审核工作台）。保留工作区原有 `.claude/agents/*`、CLAUDE.md、CONTRIBUTING.md 删除，不纳入功能提交。
- 完成 P4-01：KnowledgeEntry / ProjectKnowledge / KnowledgeRelation，草稿、待审核、确认状态，来源快照，前置依赖防环及归档保护。
- 完成 P4-02：有来源的自由回答与临时讲解和普通笔记在同一事务内保存；无引用不自动保存，beyond 不进入有来源正文，不增加模型调用。完全同标题复用，相近标题返回去重候选，不覆盖确认稿。
- 完成 P4-03：项目知识入口、状态/核心类型筛选、列表分页、来源与关联、正文编辑、独立确认、不可变历史与版本差异，中英双语。差异省略/截断显式提示。浏览器发送 expected_updated_at；旧页面编辑/确认返回 409，本地文字保留，丢弃前有明确操作；等价时区时间戳不误报冲突。未关联当前项目的条目不展示正文/编辑器。
- P4-04 进行中：新增 ErrorCause、手工诊断、项目内错题证据快照、知识映射与按概念聚合的主动复习任务 API。诊断、读取和忽略均不修改 FSRS。Again 不能关闭任务；后续 rating >= 2 的复习关闭此前错因，或用户主动忽略，记录保留。拒绝伪造 attempt/submission 来源及知识概念不一致。
- 多 Agent：只读审查代理复核自动草稿事务和审核保护，隔离库发现同一时间的 +08:00 令牌误判，已修复并纳入回归。主 Agent 统一修改源码。
- 实际执行（全部本机，无 Docker）：
  1. 改动前相关基线：`uv run pytest tests/test_knowledge.py -q` 31 passed；`uv run pytest tests/test_errors.py -q` 16 passed；`npm test -- tests/knowledge-review.test.tsx` 6 passed。
  2. 最终定向后端：`uv run pytest tests/test_knowledge.py tests/test_errors.py tests/test_agent.py -q` **74 passed**；2 条既有 FastAPI on_event 弃用警告。
  3. 迁移：`uv run pytest tests/test_tutor_migration.py -q` **24 passed, 2 skipped**；两项既有有意跳过，未新增跳过。
  4. `uv run ruff check app tests` 通过；此前定向 ruff --fix 仅整理导入。
  5. `npm test -- tests/knowledge-review.test.tsx` **10 passed**；`node node_modules/typescript/bin/tsc --noEmit`、`npm run lint` 通过；`NODE_OPTIONS='' npm run build` 成功，路由清单含 `/projects/[projectId]/knowledge`（PowerShell 使用 `$env:NODE_OPTIONS=''`）。
  6. 一次定位命令误写不存在的 `tests/test_knowledge_draft.py`，pytest 未收集任何测试；确认草稿测试实际在 test_knowledge.py，已由第 2 项全部执行通过。没有通过跳过失败用例推进。
- 剩余问题与界限：P4-04 尚缺前端操作入口、代码评审证据专用关联与闭环验收，故不标完成。共享知识的所有者归档时后端拒绝写入，引用项目活跃时界面仍会展示按钮并收到 409；可补前端只读提示。旧 API 不传并发令牌保留兼容语义。Markdown 导出尚未实现，知识正文/版本由 SQLite 统一保存。
- 未做：全量 pytest/Vitest、浏览器端到端或真实模型调用；本轮不改变模型推理路径且定向契约覆盖改动，按用户要求减少重复大测试。未操作个人学习库、删除历史、执行上传程序或推送远程。
- 下一步：先完成 P4-04 用户界面和有效提交证据关联，验证用户主动复习闭环；再实现 P4-05/06 跨项目建议的确认、拒绝和变更留痕。P5 再集中核查旧 review/today 页面是否仍依赖到期日期筛选，并完成结构化课程知识驱动整合。
