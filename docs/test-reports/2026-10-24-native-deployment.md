# 2026-10-24 原生服务器部署验收

## 交付

- 地址：`https://114.55.110.183/`，沿用本地 `ADMIN_PWD`。前后端使用 systemd，绑定回环地址，非 root 运行；两服务已启用开机启动。
- 部署源码：初始 `c56159e`，最终追加 `fff5f36` 登录表单修复。前端在本机完成生产构建，服务器安装 Linux 生产依赖；没有构建或启动本项目 Docker 容器。
- 经用户确认复用现有 HTTPS 入口，原 `/v1/*` 与 `/v1beta/*` 模型网关保持原路由。现有入口自身由既有 Caddy 容器管理，本项目前后端独立运行。
- TLS 证书验证通过。Nginx 仅监听入口网络的宿主机内部地址，前后端未开放公网端口。
- 已撤销服务器端本次临时 SSH 公钥并删除服务器上的重复配置秘密文件。本地临时目录 `F:\Temp\studyforge-deploy-20261024` 的删除被自动审批拒绝（仅返回 `blocked by policy`），未绕过删除限制；已关闭目录权限继承，仅保留当前身份与 SYSTEM 访问。该目录内仍有本次临时副本，需后续由用户清理。
- 运行、路径、配置、数据备份和回滚见 [DEPLOYMENT.md](../DEPLOYMENT.md)。

## 数据证据

通过 SQLite backup API 获取一致快照，保留本机数据库，未清空或合并学习历史。源库没有 pending/running 作业。

| 对象 | 数量 |
| --- | ---: |
| 项目 | 3（进行中 1、已归档 2） |
| 课程 / 模块 / 课时 | 9 / 23 / 168 |
| 测验题 / 答题记录 | 69 / 5 |
| AI 作业 / 模型调用历史 | 89 / 288 |
| 教学会话 / 教学消息 | 2 / 3 |
| 提交 / 提交文件 / 代码评审 | 3 / 3 / 4 |
| 附件元数据 / 资料目录中的文件 | 2 / 21 |

- 快照数据库 SHA256：`47277bcec9f73d0ae46985f677d8ffcc2797588cdcc4b9d369805b9816031e51`。
- 服务器首次启动前数据库字节哈希相同；启动后全部 **41 张物理表的记录数与排序内容哈希相同**，全部 **21 个文件 SHA256 相同**。FTS 虚表本身不能读取，因此核验其物理影子表，并明确记录下述既有问题。
- 两个数据库附件均经线上受保护下载接口重新下载，字节数与数据库 SHA256 相同。
- 上线验收前再次检查本地业务表，未发现快照后新增变化。登录验收会写入/撤销线上认证会话；验收后线上认证表无需保持与快照字节相同。
- 上线快照、文件和清单保留在服务器 `/opt/studyforge/backups/local-snapshot-20261024/`。不是持续同步，不覆盖网站后续学习记录。

## 实际执行的验证

| 验证 | 结果 |
| --- | --- |
| 修改前：`pytest backend/tests/test_auth.py backend/tests/test_error_shape.py -q` | 47 passed |
| `pytest backend/tests -q -p no:randomly --junitxml=.artifacts/deploy-backend-tests.xml`，fake provider | 1469 passed / 2 failed / 2 skipped；共 1473 |
| 单独复跑 `test_projects.py::test_course_details_are_read_in_one_snapshot` | 1 passed；不代表全量稳定 |
| 修改前 `npm test` | 45 文件 / 274 passed |
| 修复后 `npm test -- tests/login.test.tsx tests/auth-proxy.test.tsx` | 2 文件 / 26 passed |
| 修复后 `npm run lint`、`npx tsc --noEmit`、`npm run build` | 均通过 |
| `ruff check backend/app backend/tests --output-format concise` | 47 项既有错误，未宣称后端 lint 通过 |
| Linux 锁定 Python 依赖、Linux `npm ci --omit=dev` | 安装成功 |
| `systemd-analyze verify`、`nginx -t`、两服务健康检查 | 通过；Nginx 有原有其他站点的重复 IP server_name 警告 |
| 实际重启前后端后，用原有登录 Cookie 请求业务页面 | 200，持久会话可续接 |
| HTTPS 首页、登录、匿名页面和 API 门禁 | 首页/登录 200，业务页 307，受保护 API/文档 401 |
| 跨 Origin 登录 / 同源登录 / Secure + HttpOnly Cookie | 403 / 204 / 通过 |
| 登录后项目、课程、任务 SSR 页面 | 均 200 |
| 课程 ID/标题与本地比较、两个附件下载 | 一致 |
| 退出后复用客户端访问业务 API | 401 |
| 原模型网关 `/v1/models` | 无密钥 401、有原密钥 200；配置模型存在 |

没有调用付费模型生成接口，不把模型列表检查表述为真实生成验收。

## 浏览器与修复

真实 Edge / Playwright：密码登录到项目页、课程页完整显示 9 门课程，1440px 桌面与 390px 手机截图检查；没有 pageerror，手机课程列表无横向溢出。截图位于被 Git 忽略的 `output/playwright/deployment/`。路由切换取消旧页面视频和预取请求产生 `ERR_ABORTED`，不计为 JavaScript 运行时错误。

验收发现旧表单在 React 尚未接管时采用浏览器默认 GET，可能把密码带入 URL。修复为显式 `method="post"`，保留现有 JSON 登录处理，补充回归断言。禁用 JavaScript 的真实浏览器使用测试占位密码提交，已确认请求为 POST 且 URL 不含密码；无脚本情况下页面不提供完整登录功能。检查了本次部署相关 Nginx 访问日志，未发现该类密码查询落盘记录。浏览器验收工具不会保存认证 storageState 或追踪包。

反向代理还需要允许 Next.js 规范化后的内部 `https://localhost:3000` Origin，解决「登录成功但 SSR 门禁 503」。该地址只用于服务端会话校验，外部浏览器仍使用实际 HTTPS Origin，跨站写入测试继续拒绝。

## 尚未收口的既有问题

1. 全量的 `test_projects.py::test_course_details_are_read_in_one_snapshot` 失败，单独复跑通过；SQL 监听器可能受到其他测试后台查询影响，尚未完成稳定性定位。
2. `test_tutor_migration.py::test_upgrade_adds_the_tutor_and_explicit_project_tables[797e50fe684e]` 的明确表白名单遗漏已存在的 `auth_sessions`；没有放宽或跳过测试。
3. 本地旧 `resource_chunks_fts` 外部内容定义引用不存在的 `resource_chunks.chunk_id`。`PRAGMA quick_check` 为 `ok`，但 `integrity_check` 报错；本次保留全部原数据与旧索引，资源检索需后续修复。当前 Resource / ResourceChunk 均为 0，不能据此声称未来上传资料检索可用。
4. 原有后端 Ruff 问题、完整付费 AI 流程、后续自动备份未在本轮解决。服务器内存余量有限，保持单 worker，不适用于并发多用户或大批量任务。
