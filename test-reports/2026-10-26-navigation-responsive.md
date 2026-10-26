# 2026-10-26：编程题返回与跨设备适配

## 修改与范围

编程题详情返回来源题库/课时，直接访问回到课程题库；来源只允许当前课程的已知页面路径。历史/变式操作独立成行，题干可收缩；题库目录与课时目录/问答随宽度变换列数，手机顶栏自然换行。共享正文/题目渲染器将长代码、表格和显示公式限制在局部横滚区域，普通长文本换行；提交历史表格可横滚。

复用既有组件，不新增依赖，不改后端、数据结构、认证或学习状态。开始于干净的 main / 1e8a698。导航独立提交 d7af5d8；布局随后独立提交。

## 实际验证

前端目录执行：

```text
npx vitest run tests/code-question-detail.test.tsx tests/course-quiz-bank.test.tsx tests/quiz-code-feedback.test.tsx tests/lesson-quiz-dialog.test.tsx tests/code-block-copy.test.tsx --maxWorkers=2
npx vitest run --maxWorkers=2
npx tsc --noEmit
npx eslint .
npm run build
```

修改前相关基线 5 文件 / 13 passed。完整测试首次 292 passed / 1 failed，失败为旧用例断言无 returnTo 的链接；同步契约后完整复跑 **48 文件 / 293 passed**。最后的手机顶栏纯 class 调整后，浏览器再次检查，构建/TypeScript/ESLint 再通过；未为 CSS 布局增加无法验证像素行为的 jsdom 测试。`git diff --check` 通过。

本机原生 Uvicorn 8001、Next dev 3001；数据库为忽略目录中的独立验证库，使用 fake provider，不读取/修改个人学习数据库或线上数据。验证时需配置 3001 及 Next.js 内部 localhost 来源白名单，生产配置未更改。

真实 Edge 使用已安装 Playwright：

```text
node output/playwright/responsive-20261026/check.cjs
```

运行脚本和输出保存在忽略目录 `output/playwright/responsive-20261026/`（不是产品代码或生产服务）。种子样本包含长 PyTorch 函数签名、12 列表格、16 项显示公式及长标识符。

| 页面 | 修复前 390px 文档宽度 | 修复后 |
| --- | ---: | ---: |
| 课程题库 | 2812 | 390 |
| 课时题库 | 2772 | 390 |
| 编程题详情 | 1513 | 390 |
| 课时正文 | 2909 | 390 |

浅/深主题、4 页面、1920/1440/1194/1024/768/390/320px 共 **56 组**：断言整页无横向溢出，窄屏代码/表格/显示公式存在溢出时能滚动到末尾。320px 顶栏退出按钮高度断言防止竖排；实际点击课程题库/课时题库 → 详情 → 刷新 → 返回成功；缺省/外站/其他课程 returnTo 回到当前课程题库。还检查代码提交、窄屏历史表格、1536px 问答隐藏/显示，无 pageerror。

人工查看截图：`final-light-bank-390.png`、`final-light-bank-1920.png`、`final-dark-lesson-detail-1194.png`、`final-history-320.png` 等；其余两主题截图和 `before.json` / `final.json` / 构建、类型、lint、Vitest 日志同目录。

## 已知边界

- 真实浏览器是 Windows Edge，尺寸模拟未替代 iPad/iPhone Safari 实机测试。
- 开发模式课时正文仍有修复前已出现的 headingId SSR/客户端属性 hydration 警告（toc-0 / toc-1），不等同于 pageerror；已登记 UI-MD-01。本轮未改目录编号逻辑。
- 自动审批拒绝本机 `next start`，返回 blocked by policy，无更具体解释。未尝试绕过；生产构建成功与生产服务实际启动分别记录，后者未验收。
- 无后端代码修改，未运行后端完整回归；没有付费模型调用、Docker 验证、推送或线上部署。线上使用需要后续发布这两个提交。
