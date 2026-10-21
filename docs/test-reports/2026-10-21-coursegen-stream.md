# 测试记录：课程生成（系列课程 + 流式渐进展示）（2026-10-21）

## 背景：用户的问题

> 我想学 transformer，他能否出一系列学习资料，让我一步一步学，包括每一节的练习题等等，而不是只能出一节内容？

> 对于比较久的 agent 操作，前端要有可视化进度，不能干等；课程生成应先出大纲、并行生成各节，每好一节就展示一节。

## 测试 A：同步课程生成（真实模型，验证"系列"能力）

- 输入：`POST /courses/generate`，text source 为一段 transformer 学习需求描述（注意力机制→位置编码→多头注意力→Encoder-Decoder→训练技巧→LLM 应用，要求每节有讲解和练习题）。
- 模型：`gemini-3.8-flash`，耗时约 8 分钟。
- 结果：通过。生成课程《Transformer 架构系统学习指南》（id 104），**3 个模块、7 节课、28 道练习题**，每节 4 题：

| 模块 | 课时 | 内容字数 | 练习题 |
|---|---|---|---|
| 注意力机制与核心组件 | 注意力机制直觉与缩放点积注意力 | 1631 | 4 |
| 注意力机制与核心组件 | 位置编码机制 | 1270 | 4 |
| 注意力机制与核心组件 | 多头注意力机制 | 1984 | 4 |
| Transformer 架构整合 | 残差连接与层归一化 | 2519 | 4 |
| Transformer 架构整合 | 完整的 Encoder-Decoder 结构 | 3087 | 4 |
| 训练技巧与大语言模型应用 | 关键训练技巧：学习率预热与标签平滑 | 3343 | 4 |
| 训练技巧与大语言模型应用 | Transformer 在大语言模型中的应用 | 1378 | 4 |

- 练习题质量抽样（第 1 节）：
  - "在注意力机制中，查询（Query）、键（Key）和值（Value）各自承担着不同的职能。下列关于三者交互关系的描述，哪一项是正确的？" → 答案："查询与键计算相似度以生成权重，再用该权重对值进行加权求和"
  - "在缩放点积注意力公式中，将点积结果除以 √d_k 的主要原因是什么？" → 答案："防止点积数值过大导致 Softmax 进入饱和区而引起梯度消失"
  - "Query 和 Key 的维度均为 d_k，Value 的特征维度为 d_v。该注意力模块最终输出的向量最后一维特征维度由哪一个决定？" → 答案："由 Value 向量的维度 d_v 决定"
- 结论：**能出一系列**，不是只能出一节。但 8 分钟全程无反馈——这正是测试 B 要解决的。

## 测试 B：SSE 流式课程生成（fake provider，验证渐进展示管线）

新增端点 `POST /courses/generate/stream`（`text/event-stream`）：

1. 先同步做来源 intake（422 仍走 HTTP 状态码，不进流）；
2. `outline` 事件：大纲标题 + 全部模块/课时标题，前端据此先画出所有课时的占位；
3. 各节用 `ThreadPoolExecutor(max_workers=4)` 并行生成，每完成一节发一个 `lesson` 事件（带 `module_index`/`lesson_index`，到达顺序不定，前端按索引归位）；
4. 失败的一节发 `lesson_failed`，其余继续（与同步路由的 drop-one-keep-rest 一致）；
5. 全部结束后落库、回填 `llm_calls.course_id`，发 `done`（含 `course_id` 与费用）；致命失败发 `error`，不落库。

真实 HTTP 实测事件时序（fake provider，4 节课）：

```
[ 0.0s] outline: Fake Course: transformer attention is all — 2 modules, 4 lessons planned
[ 0.1s] lesson  (m0,l0): Introduction to transformer attention is all (quiz=2)
[ 0.1s] lesson  (m0,l1): Handling Untrusted Content (quiz=2)
[ 0.1s] lesson  (m1,l1): Reviewing transformer attention is all (quiz=2)   ← 乱序到达
[ 0.1s] lesson  (m1,l0): transformer attention is all in Practice (quiz=2)
[ 0.1s] done: course_id=1
```

- 落库核对：`GET /courses/1` 的模块/课时数与流事件一致。
- 并行安全性：provider 每次调用新建 HTTP 连接、meter 每次记账开独立 DB session，线程安全。

### 前端：GenerationProgress 组件

- 大纲到达即渲染全部课时槽位（标题 + spinner 骨架）；每节到达就地填充（✓、练习题数、概念标签，可展开看内容摘要与题目列表）；顶部进度条 "已就绪 X/Y 节"。
- 失败课时标红感叹号并继续；Cancel 按钮可中止（AbortController）。
- 文本/URL 来源走流式；**带 PDF 的仍走原同步路由**（multipart 流式未做，见下）。
- 真机截图（生产构建 + fake 后端）：`docs/test-reports/shots/10-streaming-done.png`（全部就绪）、`11-streaming-expanded.png`（展开课时 + 成功横幅）。

## 自动化测试

- 后端 `tests/test_generate_stream.py`（2 个）：事件顺序 outline→lessons→done、乱序到达按索引归位、落库一致；来源错误在首字节前以 422 返回。
- 前端 `tests/generation-progress.test.tsx`（3 个）：大纲先画槽位、乱序 lesson 事件正确归位、失败课时标记且其余继续、流错误展示。
- 回归：后端 `pytest tests/` **1343 passed, 2 skipped**；前端 vitest **25 files / 181 passed**；`tsc` clean。
- 修过两个回归：新增端点时误删了 `/courses/generate/pdf` 的装饰器行（已恢复）；`generate-form-stale-error` 有一个用例改走流式，改为带 PDF 走同步路径。

## 未做 / 待定

- 真实模型的流式端到端：演示后端的 API key 已随旧进程失效，需用户重新提供 key 后再测（同步生成的真实模型测试已通过，流式复用同一管线函数）。
- PDF 来源的流式生成未做（仍为同步 spinner）；其它长耗时 agent 操作（code review 约 30s、explore 问答）未加流式。
- `main.py` 继续膨胀了一百多行：流式端点与现有 4 个 generate 端点同文件是既有格局，提取需搬运 `_ingest_or_refuse`/`_save_course` 等 helpers，记入 DECISIONS 暂不拆。
