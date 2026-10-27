# 2026-10-27：最新公式与图表渲染

## 修复与版本

用户反馈课时公式异常，并要求使用最新版本的公式、图表组件。起点为干净的 main / 64b89d7；修改仅涉及前端依赖、回归测试和文档。

根布局加载 KaTeX 0.19.0 的 CSS，但 rehype-katex 使用 0.16.47、Mermaid 使用 0.18.10，数学解析器也有独立 0.16.47 副本。内部布局类名不同，例如旧 `.overline` 与新 `.katex-overline`。隔离课时截图中，修复前上划线丢失，修复后恢复。

通过 npm 官方 registry（显式 `--registry=https://registry.npmjs.org`）核验 latest：

| 组件 | 最新稳定版 | 处理 |
| --- | --- | --- |
| KaTeX | 0.19.1 | 升级根依赖，用 `overrides.katex = "$katex"` 统一所有使用方 |
| Mermaid | 12.2.0 | 已是最新；图内公式复用统一后的 KaTeX |
| ECharts / echarts-for-react | 6.1.0 / 3.0.6 | 已是最新，无需改版本 |
| rehype-katex / remark-math | 7.0.1 / 6.0.0 | 已是最新，验证使用新版 KaTeX 的兼容性 |
| react-markdown / remark-gfm | 10.1.0 / 4.0.1 | 已是最新，无需改版本 |

lockfile 保留唯一 KaTeX 0.19.1 及官方包地址；SHA512 与官方 registry 元数据一致。移除旧副本和无用旧 commander，不增加依赖。初次安装沿用本机镜像配置，随后显式核对官方版本及校验值，并将新包地址规范到官方 registry。安装有既有 react-vant/react-spring 的 React peer warning，未扩大修改范围。

不改课程、题目、作答或数据库结构。安全配置保持既有 Markdown HTML 转义、KaTeX 默认不信任扩展及 Mermaid strict。最新版 rehype-katex 仍声明旧 KaTeX 范围，后续升级必须保留跨版本 override 的兼容验证，见 ADR-037。

依据：[KaTeX 官方版本一致性说明](https://katex.org/docs/issues.html)、[Mermaid 官方数学公式配置](https://mermaid.js.org/config/math.html)。

## 实际验证

前端目录执行：

```text
npx vitest run tests/code-block-copy.test.tsx tests/lesson-toc.test.tsx
npx vitest run tests/math-rendering.test.tsx --maxWorkers=2
npm install
npm ls katex mermaid echarts echarts-for-react
npx vitest run --maxWorkers=2
npx eslint .
npm run build
npx tsc --noEmit
```

基线 2 文件 / 6 passed。初次基线筛选误用不存在的文件名，未执行用例；已用上述正确文件名完成。新增回归在修复前 3 failed / 2 passed：三个依赖解析到旧副本；修复后完整前端 **49 文件 / 298 passed**，包含新增 5 条。覆盖两个 Markdown 入口的行内/显示公式、MathML 分数和矩阵、无障碍隐藏属性，以及依赖解析一致性。完整测试有既有 jsdom 伪元素 getComputedStyle 提示，无失败。

ESLint、生产构建、独立 TypeScript、`git diff --check` 通过。ECharts 6.1.0 使用实际库 SSR 渲染 bar/pie 至 SVG，并断言有绘图 path，均成功；这不等同于统计页面交互测试。

## 浏览器证据与边界

通过 Playwright CLI 真实登录与截图，再沿用已有项目脚本方式批量验证：

```text
node output/playwright/math-20261027/check.cjs
```

本机 Uvicorn 8001 + Next dev 3001、独立验证库 `output/playwright/math-20261027/verification.sqlite3`、fake provider 和临时验证密码。种子来自之前的隔离验证库，只更新该副本课时/题目，不操作个人学习库或线上数据，不调用付费模型。

Windows Edge：课程正文、编程题详情 × 浅/深主题 × 1440/1194/390px，共 **12 组**全部通过。断言分数横线非零宽度且有边框、分子位于横线上方、上划线可见、矩阵存在、Mermaid 图内 MathML 存在、无 KaTeX 错误、整页不溢出、长公式可滚动到末尾；无 pageerror/console error。流程图包含 Dataset → DataLoader → 损失公式。

结果、脚本和截图均在上述忽略目录。人工查看 `before.png`、`after-lesson.png`、`dark-lesson-390.png`；缺失上划线恢复，窄屏公式完整且局部横滚。

- Docker daemon 未运行，`docker compose ps` 返回管道不存在，采用本机原生验证。
- 额外本机 `next start --hostname 127.0.0.1 --port 3001` 被自动审批拒绝，仅返回 `blocked by policy`；未绕过或重试。生产构建成功，生产服务启动未验收。
- 未改后端、未运行后端完整回归；Edge 尺寸检查不替代 iPad/iPhone Safari 实机测试。
- 未推送、未部署线上，线上效果需发布后验收。回滚依赖文件并重建前端即可，无数据迁移。
