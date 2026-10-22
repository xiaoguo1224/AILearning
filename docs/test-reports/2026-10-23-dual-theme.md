# 首页及双主题验收 — 2026-10-23

基线：main `29b0265`；先完成课程生成/链路恢复提交 `b5010e7`，再实施本批。用户独立修改的知识页宽度保留，不纳入本次提交。

## 范围

- 默认浅色，Cookie 保存主题一年；SSR 直接输出主题，无系统偏好覆盖。浅色首屏为自然影像、居中标题、学习文案与双入口；深色保留球体滚动叙事。
- 课程名艺术字体字号 28–48px、自动循环滚动；深色球体滚动旋转范围 360°，课程场景自动下移/旋转，可暂停、支持减少动态效果。
- 工作台侧栏/项目入口/任务表格保留；课程卡片、知识图谱、状态、弹窗、调用链路及摘要使用统一配色。修复未定义的旧颜色变量。移动端任务详情随屏幕宽度展示，调用记录独立滚动。
- `/today` 为 404；历史学习、课程、复习数据未删除。

## 实际验证

在 Compose frontend 容器中挂载当前 `src`、`public`、`tests` 运行：

1. `npx tsc --noEmit`：通过。
2. `npm run build`：通过，包含所有既有业务路由，无 `/today`。
3. `npm test -- tests/themes.test.tsx tests/landing-page.test.tsx tests/course-list-current-contract.test.tsx tests/course-workflows.test.tsx`：26 passed，覆盖恢复、审查、重试、分页、图谱坐标、课程排序、主题与摘要保留。
4. 完整 Vitest：185 passed / 43 failed。与本会话 main 基线 162 passed / 48 failed 逐测试名比较，无新增失败；未删除或跳过失败用例。旧 UI 包装器/表单契约等失败仍在。
5. 修改的主题、首页、任务、图谱等定向 ESLint：通过。完整 `npm run lint`：14 errors / 33 warnings，均为既有问题（基线 17 errors / 50 warnings），没有降低规则。

日志保存在本机忽略目录 `.artifacts/theme-{targeted,vitest-final,typecheck-final,build-final,lint-final,targeted-eslint}.*`。

浏览器：使用 3001/8001 独立临时 SQLite 和确定性 provider，未调用付费模型、未写个人数据库；实际 3000/8000 额外进行只读验证。

- 首次访问浅色，浅色标题为“从一点好奇，长出无限可能”；背景视频成功播放。切换深色、刷新、进入工作台均保持深色。
- 调用链路浅色白底/深色墨绿底，文字同步变化，独立滚动高度 360px，记录与展开摘要不丢失；实际 3000 页面现有记录亦正常展示。
- 课程卡片浅色正文颜色 rgb(82,105,79)，深色无白底残留。真实 ECharts 渲染两套 treemap。
- 深色第二场景检测到自动 `orbit-drift`，1.1 秒内 transform 改变；暂停后 animationPlayState=paused；1440px 时课程字号43.2px。
- 1440px 与390px 验证：首页、课程、任务页无整页横向溢出；移动端调用记录详情宽度适配屏幕。浏览器无 pageerror。
- 实际 `http://localhost:3000/today`：404；后端 OpenAPI 包含持久生成/审查/重试路由和 Job.trace。

截图在忽略目录 `output/playwright/theme-*.png`。全量测试与 lint 尚未达到全绿，本批没有声称全量质量门禁通过。恢复后端的68项回归与完整生成浏览器流程见前一份 generation-trace-recovery 报告。
