# 知径 MindTrail 品牌验收 — 2026-10-23

前序：课程生成/任务链路恢复 `b5010e7`；双主题及默认浅色 `eb6131f`。本批在上述任务完成后单独实施。

## 修改

- 名称：知径 MindTrail；标语：连接知识，走出自己的学习路径。
- Logo：书页、蜿蜒上行路径、终点圆点；提供透明 SVG 标识与独立 favicon，界面使用当前主题颜色。删除旧 Next.js 占位 favicon。
- 首页/工作台/旧导航共用 SiteBrand；网页元信息、复习页标题、后端 API 标题、Tutor 品牌文字及导出描述一致。
- 重写 README 为当前独立产品文档，包含真实功能、使用闭环、启动命令、模型配置、数据边界与已知工程状态；新增 NOTICE，补充隐私文档中的公共媒体请求说明。
- 未改学习数据库、环境配置名、偏好 Cookie、任务接口或历史日历 PRODID。用户知识页宽度修改继续保持独立、未纳入提交。

## 实际验证

Docker 内：

- 前端四个定向文件：26 passed；`npx tsc --noEmit`、品牌文件定向 ESLint、`npm run build` 均通过。
- 完整前端：185 passed / 43 failed，逐项比较 main 原基线无新增失败；完整 lint14 errors / 33 warnings，仍未全绿。
- 后端 `test_teaching.py test_tutor.py test_ingest.py test_staged_generation.py test_generation.py test_usage_api.py`：239 passed；另跑 `test_planning.py`：77 passed。合计316项，只有现有 FastAPI on_event 弃用警告。
- 完整后端 Ruff 已执行但未通过，207项报告包含 Windows 挂载文件的 EXE002 与已有规则问题；没有关闭规则或将该检查描述为通过。

浏览器：1440/390视口验证新名称/Logo、浅深主题、跨页导航和英文切换；中文网页标题为“知径 MindTrail”，英文为“MindTrail”，favicon 请求200，无 pageerror 或整页横向溢出。实际 localhost:3000 也显示新名称和默认浅色，课程生成表单正常；8000 OpenAPI 显示 MindTrail 并保留审查/重试路由。没有向实际个人数据库发起生成或付费模型请求。

README、NOTICE 本地链接全部存在；两个 SVG 通过 XML 解析；LICENSE 与上游 README 对 `29b0265` 的 Git 差异为零（文本校验仅归一化 Windows 换行）。源码中根 LICENSE 没有删除或改写。

记录位于本机忽略目录 `.artifacts/brand-*` 与 `output/playwright/mindtrail-*.png`。本次没有运行完整后端 pytest 或真实供应商教学质量验收。
