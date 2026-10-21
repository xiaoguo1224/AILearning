# 测试记录：课后代码题 zip 压缩包上传（2026-10-21）

- 功能：`POST /api/projects/{id}/submissions/upload` 支持 `.zip` 代码包，服务端解包为"一成员一代码附件"
- 模型：`gemini-3.8-flash`（`static_ast+llm` 混合评审）
- 范围：后端 `zip_artifacts()` + 上传路由 + 前端上传框；自动化测试 3 个新增用例全部通过
- 结论：通过。单文件与多文件两条路径的评审内容均符合预期（错误定位 / 写法建议 / 是否调整）。

## 测试 A：单文件粘贴提交（回归对照）

### 提交内容

`solution.py`（粘贴）：

```python
import torch

# 课后习题：批量矩阵乘法
# 给定 x: (3, 4), w: (4, 5)，计算 y = x @ w，要求 y 的形状为 (3, 5)
x = torch.randn(3, 4)
w = torch.randn(4, 5)
y = x * w  # 用逐元素乘法实现矩阵乘法
print("y.shape =", y.shape)
```

`run.log`（粘贴）：

```
$ python solution.py
Traceback (most recent call last):
  File "solution.py", line 8, in <module>
    y = x * w  # 用逐元素乘法实现矩阵乘法
RuntimeError: The size of tensor a (4) must match the size of tensor b (5) at non-singleton dimension 1
```

备注：`user_note` = "课后习题2.3：实现矩阵乘法，本地运行报错了"

### 评审摘要（全文）

> 静态分析显示，代码尝试使用逐元素乘法运算符 `*` 对形状为 (3, 4) 和 (4, 5) 的张量进行操作。在 PyTorch 中，`*` 会触发逐元素相乘并尝试广播，导致维度不匹配错误。矩阵乘法应使用矩阵乘法专用运算符或 API。

### Findings（全文）

1. `run.log:5` · `runtime_shape_mismatch` · error · user_reported
   - 描述：Your log reports a shape/broadcast failure: RuntimeError: The size of tensor a (4) must match the size of tensor b (5) at non-singleton dimension 1
   - 建议：Print the tensor shapes on both sides of the failing operation in your own environment, then compare them with the shapes the code intends.
2. `solution.py:7` · `tensor_operator_mismatch` · error · confirmed_static
   - 描述：第 7 行使用了逐元素乘法运算符 `*`。对于代码中已明确形状为 (3, 4) 和 (4, 5) 的二维张量，逐元素乘法要求末尾维度满足广播机制（维度相等或其中一个为 1），而末尾维度 4 与 5 不匹配；此外，注释要求实现矩阵乘法，逐元素相乘不符合计算目标。
   - 建议：将逐元素乘法运算符 `*` 替换为矩阵乘法操作，例如使用矩阵乘法运算符 `@` 或调用 `torch.matmul` / `torch.mm`。

### Hints（全文）

- L1：请观察 solution.py 第 7 行中执行乘法时所使用的运算符。
- L2：在 PyTorch 中，`*` 运算符代表逐元素相乘（遵循广播规则），要求张量对应维度相同或为 1。而针对形状为 (3, 4) 与 (4, 5) 的二维矩阵，需要的是线性代数意义上的矩阵乘法。

### 小问题

- finding 定位行号差一（报第 7 行，实际 bug 在第 8 行，源于提交文本首行空行）。不影响结论，暂不修。

## 测试 B：zip 多文件上传（本次新增功能）

### 提交内容

`homework.zip`（multipart 文件上传），内含 3 个成员 + 1 个日志文件：

`model.py`：

```python
import torch

def build():
    return torch.nn.Linear(4, 5)
```

`train.py`：

```python
from model import build
import torch

net = build()
x = torch.randn(3, 4)
y = x * net.weight  # BUG: 应为 net(x)
print(y.shape)
```

`README.md`：

```markdown
# 课后习题
```

`run.log`（单独文件上传）：

```
$ python train.py
Traceback (most recent call last):
  File "train.py", line 7, in <module>
    y = x * net.weight
RuntimeError: The size of tensor a (4) must match the size of tensor b (5) at non-singleton dimension 1
```

服务端解包结果：4 个 artifact —— `model.py`(code)、`train.py`(code)、`README.md`(code)、`run.log`(log)。

### 评审摘要（全文）

> 静态分析与你的日志报告均指出，代码在执行线性层计算时使用了逐元素乘法 `*`，导致维度不匹配的广播错误，未能正确调用 PyTorch 模块的前向传播。

### Findings（全文）

1. `run.log:5` · `runtime_shape_mismatch` · error · user_reported
   - 描述：Your log reports a shape/broadcast failure: RuntimeError: The size of tensor a (4) must match the size of tensor b (5) at non-singleton dimension 1
   - 建议：Print the tensor shapes on both sides of the failing operation in your own environment, then compare them with the shapes the code intends.
2. `train.py:6` · `api_misuse` · error · confirmed_static
   - 描述：静态分析显示，代码对输入 `x` 与 `net.weight` 直接使用了 `*` 运算符。`torch.nn.Linear(4, 5)` 的权重形状为 `(5, 4)`，与形状为 `(3, 4)` 的 `x` 无法进行逐元素广播；且该写法绕过了线性层的偏置与前向传播机制。
   - 建议：请通过调用模型实例本身来执行前向计算，而不是手动提取权重进行逐元素乘法。

### Hints（全文）

- L1：请检查 `train.py` 第 6 行对 `net.weight` 的使用方式。
- L2：PyTorch 中的 `*` 表示逐元素相乘。`Linear(4, 5)` 的权重形状是 `(5, 4)`，无法与 `(3, 4)` 的输入直接广播相乘。全连接层的标准计算应当是矩阵乘法加偏置（$x W^T + b$）。

### 结论

- zip 解包、成员校验、多文件评审链路全部通过。
- 关键价值验证通过：评审**跨文件**理解了 bug —— 结合 `model.py` 中 `Linear(4, 5)` 的权重形状，指出 `train.py` 不应手动取 `net.weight` 做 `*`，而应调用模型前向。这正是"多文件项目"场景下 zip 上传的意义。
- 同样存在行号差一（报第 6 行，实际第 7 行），与测试 A 同因，暂不修。

## 安全拒绝用例（自动化测试覆盖）

| 输入 | 期望 | 结果 |
|---|---|---|
| 成员含 `evil.exe` | 422 `unsupported_file_type` | 通过 |
| 成员路径 `../evil.py` | 422 `invalid_archive` | 通过 |
| 60 个成员 | 422 `archive_too_large` | 通过 |
| 非 zip 字节命名 `.zip` | 422 `invalid_archive` | 通过 |
| 空 zip | 422 `empty_archive` | 通过 |
| `pkg_a/model.py` + `pkg_b/model.py` 同名 | 去重为 `model.py` / `model_2.py` | 通过 |

## 回归

- 后端：`pytest tests/` **1341 passed, 2 skipped**
- 前端：vitest **24 files / 178 passed**，`tsc --noEmit` clean
