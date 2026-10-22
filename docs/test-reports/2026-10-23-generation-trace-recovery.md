# 课程生成与 AI 任务链路恢复

本批基于 main 的现有界面修复功能断链。前一份 main-alignment 记录只确认源码相同，不是功能恢复验收，本记录补充实际工作流证据。

## 恢复范围

- 恢复 `/api/courses/generation/job`、`/{job_id}/review`、`/{job_id}/retry` 路由，调用仍然存在的 `staged_gen.service`；现有 outline 路径保持兼容。
- 新建课程页读取 `?job=`，向导恢复持久任务、提纲与章节审查、版本化修改意见、失败续跑、取消、已确认章节及执行记录；保留 Ant Design 组件。
- 任务 API 返回 trace，补回服务器分页、等待审查取消、并发安全 trace 追加和终态保护。模型调用使用关联 ID、阶段、输入长度、返回长度/耗时，不把原始资料复制到 trace。
- 任务页保留表格，增加恢复任务入口、服务器分页和既有独立滚动执行记录组件。
- `_save_course(commit=False)` 让课程、题目、任务完成在同一事务提交，失败后重试不会重复保存。普通生成沿用默认提交行为。
- 未修改课程卡片、搜索排序、打开次数模型、项目图谱布局、个人数据库及已有历史。

## 实际验证

1. 修复前 `tests/test_staged_generation.py`：12 failed；修复后加调用关联测试：13 passed。
2. Docker `python -m pytest tests/test_staged_generation.py tests/test_generation.py tests/test_usage_api.py -q`：68 passed，2 项既有 FastAPI 弃用警告。
3. Docker `npm test -- tests/course-workflows.test.tsx -t 'resumable course generation|trace is|job list'`：8 passed；3 项不相关的课程/图谱测试未被该定向筛选选中，未删除或标记 skip。
4. 完整 Vitest：180 passed / 44 failed；与 main 基线逐测试名比较，没有新增失败。剩余失败与课程生成恢复不同源，保留原测试。
5. 修改的前端入口、向导、任务表、API 的 ESLint 定向检查通过。全量类型检查仍被已有 CourseBrowser/open_count 与缺少 buildCourseGraph 等错误阻止，不能宣称生产构建全绿。
6. 后端 Ruff 执行记录存在 Windows 只读挂载文件的 EXE002，以及沿用代码的 broad-exception/noqa 诊断，未删除校验或修改规则。
7. 启动两个独立 Docker 临时实例（8001/3001，临时 SQLite，确定性离线 provider），Playwright 完成：创建高难度全量审查 → 重载原任务 → 修改提纲 → 确认 → 从 AI 任务页继续原任务 → 修改章节 → 确认两章 → 保存课程。任务 URL 保持同一 ID，显示19条执行记录。截图：`output/playwright/recovered-generation-completed.png`（忽略目录）。

未使用真实付费模型测试教学质量；临时库中的生成内容仅用于流程验收。后续深浅主题与本次恢复分阶段提交。
