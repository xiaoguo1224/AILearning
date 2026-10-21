# 测试记录：评审行号标注 + 中文长问句检索修复（2026-10-21）

- 缺口来源：2026-10-21 上午 agent 能力测试（用户指令"去测试项目中所需要的 agent 能力"）发现的两个小缺口——
  1. 评审 hint 说"观察第 7 行用的运算符"，实际 bug 在第 8 行（模型自己数行号数错了一行）；
  2. 中文长问句（如"为什么矩阵乘法里面用星号会报错"）检索不到资料，关键词问句正常（分词问题）。
- 修复范围（纯后端，无前端改动）：
  - `backend/app/submissions/llm_review.py`：`_prompt()` 给模型的代码块每行前加 `N|` 行号（新增 `_number_lines()`）；`REVIEW_SYSTEM` 规则 4 改为要求引用打印出的行号。
  - `backend/app/agent/retrieval.py`：`_terms()` 把无空格的中文长串切成重叠二元词（`_expand_word`，4 字以上 CJK run → bigrams）；`_like_fallback()` 按命中词数倒序排（`ORDER BY (score) DESC`）。
  - `backend/app/resources/service.py`：新增共享 `cjk_bigrams()` / `expand_cjk_search_terms()`（`retrieval.py` 改为引用，避免循环导入）；`search_resources_fts()` 在 FTS 无命中且 query 含中文时走 `_like_search()`（同样按命中词数排序）。
- 模型：未调用真实模型（行号修复是确定性 prompt 改造，用单测断言 prompt 内容验证；检索修复走 SQLite 真实 FTS/LIKE 验证）。行号在真实模型下的引用准确率，待用户下次评审测试时复核。
- 结论：通过。48/48 相关测试通过；全量后端 1319 通过，29 个失败为沙箱代理环境问题（在干净检出上复现相同 29 个，与本次改动无关）；ruff clean（`app/main.py` 3 个 BLE001 为今早既有）。

## 修复 1：评审 prompt 行号

### 改动前的问题（复现）

`_prompt()` 原样拼接代码文本，模型需自行数行。上午实测：`solution.py` 第 8 行 `y = x * w` 的 bug，hint_level_1 写成"观察第 7 行用的运算符"。

### 改动

```python
def _number_lines(content: str) -> str:
    return "\n".join(f"{n}|{line}" for n, line in enumerate(content.splitlines(), 1))
```

`_prompt()` 中 code artifact 改为 `f"--- {filename} ---\n{_excerpt(_number_lines(content), MAX_CODE_CHARS)}"`；系统 prompt 规则 4 改为：

> Point at the smallest line range that shows the problem. The CODE section prints every code line prefixed with its 1-based number as `N|`; cite exactly those numbers. Do not invent line numbers.

### 测试（新增 `test_review_prompt_numbers_code_lines_for_the_model`）

构造 `ReviewContext(artifacts=[("solution.py", "code", "import torch\nx = torch.ones(2, 2)\ny = x * 2\n")])`，断言 `_prompt(ctx, [])` 输出含 `1|import torch`、`2|x = torch.ones(2, 2)`、`3|y = x * 2`，且 `REVIEW_SYSTEM` 提到 `N|` 行号。通过。

## 修复 2：中文长问句检索

### 根因（实测确认）

1. `search_resources_fts()` 把无空格的长问句当作一个整体加引号做 FTS phrase 查询；SQLite FTS5 的 unicode61 tokenizer 把每个连续 CJK 片段当作**单个** token（实测：文档"矩阵乘法使用 @ 运算符"被切分为 `矩阵乘法使用`、`运算符` 两个 token），因此整个问句的 phrase 查询永远命中不了。
2. 曾尝试的"F"TS 内二元词 OR"方案同样无效：实测 `"矩阵"`（二元词 phrase）返回 0 行——因为 token 是整段 `矩阵乘法使用`，二元词 phrase 要求相邻单字 token，与 unicode61 的实际切分不一致。该方案已废弃，未合入。
3. `retrieval.py` 的 `_like_fallback()` 兜底同样失效：`_terms()` 把长问句当作一个 LIKE 词（`%为什么矩阵乘法里面用星号会报错%`），资料里没有这句原话。

### 改动

- `expand_cjk_search_terms()`：按空白分词；其中 ≥4 字的连续 CJK 片段展开为去重重叠二元词（如"为什么矩阵乘法里面用星号会报错" → 为什么/什么/么矩/矩阵/阵乘/乘法/法里/里面/面用/用星/星号/号会，上限 12 个）；短词与非中文词原样保留。
- `search_resources_fts()`：FTS phrase 无命中**且** query 含中文时，改走 `_like_search()`（`resource_chunks` 全文 LIKE + 按命中词数倒序）。
- `retrieval.py::_terms()`：同样做二元词展开（上限 12）；`_like_fallback()` 按命中词数倒序（之前是 `ORDER BY c.id`，二元词 OR 下相关度最高的 chunk 未必排第一）。

### 测试

新增 4 个用例，全部通过：

1. `test_terms_expands_long_chinese_question_into_bigrams`：`_terms("为什么矩阵乘法里面用星号会报错")` 不再含原句整体，含 `矩阵/乘法/星号` 等二元词。
2. `test_terms_keeps_english_keywords_verbatim`：`_terms("Explain broadcasting.") == ["Explain", "broadcasting"]`（英文行为不变）。
3. `test_like_fallback_ranks_chunk_with_most_term_matches_first`：两个中文资料（"矩阵乘法笔记" vs 仅含"为什么"的闲聊），长问句 LIKE 兜底返回"矩阵乘法笔记"排第一。
4. `test_search_answers_long_chinese_question_with_bigram_fallback`（API 级）：上传"矩阵乘法笔记"（"矩阵乘法使用 @ 运算符或 torch.matmul，而不是星号 *。星号是逐元素乘法。"），`GET /api/projects/{id}/resources/search?q=为什么矩阵乘法里面用星号会报错` 返回 ≥1 条且第一条是该笔记；`q=矩阵乘法 星号` 关键词同样命中（回归）。

另：既有测试 `test_retrieval_falls_back_for_a_chinese_phrase`（"张量广播"）在修复中途曾因 `_like_search` 返回 dict 而最终映射按 Row 取属性报 `AttributeError`，已修复（`_field()` 兼容 dict/Row），现通过。

### 回归

- `tests/test_submissions.py` + `tests/test_agent.py` + `tests/test_resources.py`：48 passed。
- 全量 `pytest`：1319 passed, 2 skipped；29 failed 全部位于 `test_ingest.py` / `test_multi_source.py` / `test_error_shape.py`（URL 安全与网络相关），在 `git stash` 后的干净检出上复现完全相同的 29 个失败——沙箱代理环境问题，与本次改动无关（与 P5-04 记录的既有现象一致）。
- `ruff check`：本次改动文件 clean；`app/main.py` 3 处 BLE001 为今早流式端点既有问题，未动。

## 未验证 / 已知局限

- 行号修复后模型是否 100% 引用正确行号，需一次真实模型评审复核（未调用用户提供的真实模型密钥；fake provider 不走 `_prompt` 的模型分支）。
- 二元词 LIKE 兜底是"召回优先、排序兜底"的近似方案：极端情况下（如资料库很大且问句全是常用字）可能返回弱相关 chunk；当前为单人本地小资料库，可接受。未引入 jieba 等分词依赖是刻意选择（零依赖、离线可用）。
- `search_resources_fts()` 的无 `project_id` 全局搜索分支同样有 LIKE 兜底（`_like_search` 支持 `project_id=None`），但本次只在 project 作用域下实测。
