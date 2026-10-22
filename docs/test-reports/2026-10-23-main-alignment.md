# 2026-10-23 main 对齐与工作台恢复

用户要求先恢复 main 已有功能，暂停样式与亮色主题工作。

## 恢复依据与范围

- 已执行 `git fetch origin` 和 `git switch main`。HEAD、main、origin/main 均为 `29b026579a8d6347cabfe59affc6671a16488986`。
- 已撤回本次对既有工作台组件、导航、PageHeader、CourseList、生成向导、任务列表、主题 Provider 和 globals.css 的修改。未从早于 main 的历史提交取代业务实现。
- `git diff --exit-code main -- backend frontend/src/components frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/app/globals.css` 返回 0，证明既有受跟踪业务组件、接口、后端及全局样式与 main 一致。新增的首页组件不在这个“既有组件一致”结论内。
- 保留原有课程搜索与三种排序、opened_count、卡片结构和操作、Ant Design 组件以及 main 的向导/任务/图谱实现。
- `frontend/src/app/projects/[projectId]/knowledge/page.tsx` 的 `max-w-3xl → max-w-full` 不属于本次修改，保留。
- 首页新增、布局中的首页分流与本地字体、首页翻译、字体许可证及新增测试仍在工作区，未提交。`/today` 按用户明确要求不保留。
- 撤回前差异已保存至忽略目录 `.artifacts/before-functional-recovery/changes.patch`，用于追溯，不作为上线文件。

## 实际验证

以既有 frontend Docker 镜像为运行环境，通过只读挂载当前 src/tests/public 执行，未使用真实模型。

1. `npm test -- tests/course-list-current-contract.test.tsx tests/landing-page.test.tsx tests/i18n.test.tsx tests/courses-page-load-error.test.tsx`：4 文件，20 passed。覆盖课程名称/简介搜索、三种排序、打开次数显示、课程链接与删除入口、首页空态/失败态、暂停、移动导航、减少动态效果及挂载清理。
2. main 基线全量 Vitest：162 passed / 48 failed；恢复后：173 passed / 48 failed。按测试名称逐项比较，失败集合完全一致，无新增失败。11 个新增测试均通过。
3. `npm run lint`：恢复后与 main 均为 17 errors / 50 warnings，非全绿。
4. `npm exec tsc -- --noEmit`：恢复后日志与 main 基线逐字一致，22 个已有 TypeScript 错误。包括 CourseBrowser 的旧 open_count、Job/JobTrace 类型及 course-workflows 的旧契约。
5. 本次容器构建曾在字体本地化后完成资源编译，随后被现有类型门禁阻止；不能宣称生产构建成功。
6. 浏览器实际访问 `/courses`、`/courses/new`、`/projects/1`、`/jobs` 均为 200，生成页保留“全量审查”入口；`/today` 返回 404。
7. 后端定向测试尝试被容器 uv 构建环境下载 setuptools 的 PyPI TLS 错误阻止，没有获得后端测试通过证据；后端源码与 main 无差异。

## 边界

“恢复完成”在本记录中指本次覆盖的既有组件已恢复到 main，且回归没有新增失败；不意味着 main 自身所有功能、全量测试或生产构建已通过。样式问题和亮色方案保持暂停，尚未实现或验收。
