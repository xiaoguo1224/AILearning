# 前端测试全绿与 lint 收敛 — 2026-10-23

基线：`main` @ `fa5099e`，工作区开始时干净。本批只处理测试与 lint，不改产品行为；
下面每一条都写明是「改代码」还是「改测试契约」。

## 结果

| 检查 | 之前 | 之后 |
|---|---|---|
| `npx vitest run` | 185 passed / 43 failed（17 文件） | **229 passed / 0 failed（37 文件）** |
| `npx tsc --noEmit` | 通过 | 通过 |
| `npx eslint .` | 14 errors / 33 warnings | **0 errors / 28 warnings** |
| `npm run build` | 通过（Docker） | 本机未验证，见「未验证」 |

## 改代码：真实回归（测试是对的）

1. **`ui/ErrorState`、`ui/Callout` 的 role 重复**：两者在 antd `Alert` 外套了一层 div 并把
   `role` 放在外层，于是同一条消息出现两个 live region，调用方传 `role="status"` 想降噪也无效。
   现在 `role` 交给 `Alert`（antd 先写 `role="alert"` 再展开 props，`undefined` 会移除属性），
   `ref` 仍指向 DOM 节点。
2. **`ErrorState` 的 `title` 会吃掉正文**：`title` 在 `HTMLAttributes` 里是 tooltip，在 antd Alert
   里是正文槽位；调用方传 `title=""` 会把错误整条抹掉。已把 `title` 排除在透传之外。
3. **`ui/Field` 的 label 未关联 input**：`<label>` 没有 `htmlFor`，诊断表单的「Knowledge point」
   在无障碍树里没有对应控件，`getByLabelText` 也找不到。已用 `useId` 建立关联，错误行同时挂
   `aria-describedby`。
4. **`ui/PageHeader` 用 h2**：错误分支整页只剩这个标题，页面因此没有 h1。改为 level 1。
5. **`DeleteCourseButton` 丢失 `aria-describedby`**：确认面板的两个按钮不再描述它们将销毁什么，
   「正在删除」文案也丢了。已用 `useId` 恢复三段状态（加载中/预览/失败）的同一描述节点，并
   恢复 `Deleting…`（含 `aria-label`，因为 antd 的 loading 图标会污染可访问名）。
6. **课程打开计数并发丢更新**：`opened_count = opened_count + 1` 的读改写让 8 次并发只加 7 次。
   改为单条 `UPDATE ... SET opened_count = COALESCE(opened_count,0)+1`，rowcount 兼作 404 判断。
7. **`/variant` 同步端点失联**：`create_variant` 实现仍在但装饰器在后台任务改造中丢失，
   于是 `/variant` 只返回 `{job_id}`，而 `LessonQuizPanel` 仍把它当创建好的题目用（真实功能断链）。
   已把 `/variant` 还给同步端点，`/variant/job` 保留后台任务。
8. **`MarkCompleteButton` 丢了 `group` 类**：完成态的 Undo 提示靠 `group-hover` 显形，
   没有这个类就永远停在 `opacity-0`。已补回。
9. **项目页关联/解除关联按钮无可用名称**：可见文案只有「Link」「Unlink」，重复多次。
   已补 `aria-label`（解除关联带课程名）。
10. **`tests/test_course_browsing.py`** 用旧字段名 `open_count`，改为 `opened_count`；
    新建课程该列是 NULL（历史库升级而来），断言按 `or 0` 判断「没有打开过」。

## 改测试：契约已过期（旧实现或旧 UI 库）

- **UI 组件库已迁到 antd**：`ui-kit` 的 `tinted` 变体、`courses-page-contract` 的
  react-vant 类名比较、`mark-complete-affordance` 的 Tailwind hover token，都是在断言已不存在的
  样式实现。改为断言当前真实契约（antd 变体、pill CTA 的 token、成功色），并在注释里说明
  旧的对比度保证不再由 class 字符串承载。
- **判题/提示/出题改为后台任务**：`QuizSection`、`LessonQuizPanel` 走
  `startGradeJob`/`startHintJob`/`startQuizGenerateJob` + `getJob` 轮询，而测试还在 mock
  `answerQuiz`/`getQuizHint`/`generateQuizQuestions`。新增 `tests/job-mocks.ts` 统一按任务流
  驱动，四个文件的失败由此消失。
- **代码题不再在题库内联作答**（`a65c1a6` 起就有独立页面）：`quiz-code-feedback`、
  `quiz-hint-variant` 改为断言「题库给出跳转链接、不提供第二套提示入口」。
- **知识页的上一页/下一页已随列表移除**：改为断言筛选条件确实传到了查询。
- **`RegenDraftPreview` 多了 concepts 字段**：按值查找会命中两个输入框，改为按 label 定位。

## 未验证 / 未做

- `npm run build` 本机未跑通：Next 清理 `.next/turbopack`（50 个文件）时被沙箱的批量删除保护
  拦下，与代码无关。上一次生产构建通过记录见 `2026-10-23-dual-theme.md`（Docker）。
- 剩余 28 条 lint warning 是迁移遗留的未使用变量/导入，已清掉 5 条，其余未逐一处理。
- 本批期间工作区被另一处同时修改（新增 `fill` 题型、多模态 `images` 参数、`CreateCourseTabs`
  重构）。上表的前端数字在该批改动之后测得，后端数字不成立，见下一条。

## 后端（部分失效）

修复后定向验证：`test_course_browsing.py`、`test_course_quiz.py`、`test_usage_attribution.py`、
`test_e2e_flows.py` 共 37 项通过。全量跑过一次 1418 passed / 1 failed，随后工作区继续被改动
（`metering.py` 增加 `images` 参数，但 `FakeProvider` 与测试内的 provider 桩仍是 4 参数），
全量基线需要在并发改动结束后重跑。
