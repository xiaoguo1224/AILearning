# 2026-10-26：返回路径与响应式修复上线

## 发布范围

用户明确追加要求提交、推送并部署服务器。`d7af5d8`（返回来源页）与 `513e3cb`（响应式适配）已推送到 origin/main；应用 release 为 `/opt/studyforge/releases/513e3cb-20261026`，前端 BUILD_ID 为 `B1nlnLe6cdgyoXGkmaT6f`。

复用既有原生 systemd 和 HTTPS 入口，不使用 Docker，不更改模型网关、配置或学习数据。源代码由明确 Git 版本归档，前端产物来自本轮通过的本机生产构建。两包上传后逐一核验 SHA256：

| 包 | SHA256 |
| --- | --- |
| source.tar | 40620c9dcdac3c751c5c92e73ca3b5cc3210c119f7808d33ce9a50fcd8c2a6a7 |
| frontend.tar.gz | 28ada33f310f44fdc5291eeafc1eed440b9a8c4298afd28e4bb5d9d338832d5f |

核对线上/新版本 backend/app 的全部 Python 文件哈希一致、前端 package-lock 哈希一致；新 release 以硬链接复制既有 Linux node_modules，不运行会改变旧依赖的安装步骤。设置独立可写 `.next/cache`。仅原子切换 current 并重启前端，后端 PID 509447 保持不变，无启动迁移或本地数据覆盖。

## 备份与回滚

旧版本 `/opt/studyforge/releases/1e8a698-20261025` 保留。新备份 `/opt/studyforge/backups/513e3cb-20261026` 为 0700，包含 SQLite backup API 一致快照（quick_check=ok）、附件/资料、0600 环境文件和发布清单。快照只用于备份，没有覆盖当前线上库。

切换脚本在登录页、后端健康或 HTTPS 检查失败时自动切回旧版本。后续若需回滚此次 UI 发布，只需将 current 原子切回旧 release 并重启前端，不恢复旧数据库，不覆盖发布后产生的学习记录。

## 实际检查

- `git fetch origin` 首次遇到 Windows schannel TLS 握手错误；用 `git -c http.sslBackend=openssl fetch origin` 成功，TLS 证书验证保持开启。`git push origin main` 成功，从 1e8a698 更新到 513e3cb；远端 ref 再次核对一致。
- systemd：两个服务 active，前端新 PID 557378，后端 PID 保持 509447，自动重启计数均为 0；前端 517ms Ready。日志中旧前端退出 143 是本次正常 stop/restart，随后新实例正常启动。
- `http://127.0.0.1:8000/health`：200 / status=ok；本机前端与外部 HTTPS 登录页均通过。此前本机 next start 被自动审批拒绝的限制，不再代表服务器生产运行状态；本次服务器 systemd 生产启动已实际验收。
- 外网 HTTP：公开首页/登录页 200，匿名课程页 307、课程 API 401；登录后课程题库、课时题库与编程题详情 200。Secure/HttpOnly Cookie、退出撤权、28 个前端静态脚本均通过。既有 `/v1/models` 未认证仍返回 401，入口路由保留。
- 在线真实数据定位到截图中的 manual_sgd_step：课程 3、课时 19、题目 132。未提交答案、调用 AI 或重生成题目。
- 真实 Edge：课程题库和课时题库 → 编程题详情 → 刷新 → 返回上一级，均回到来源页。浅/深主题 × 课时题库/代码详情/课时正文 × 1440/1194/1024/768/390/320px 共 **36 组**均无整页横向溢出，320px 退出按钮没有竖排。无 pageerror、无 console error；除登录/退出和既有课程阅读计数外没有业务写请求。截图已人工检查。
- 首次浏览器等待 networkidle、随后首次截图等待完整中文字体下载各遇到默认 30 秒超时；分别改用 DOM/可见元素就绪和 120 秒字体截图等待后，完整 36 组通过。没有禁用字体、隐藏溢出或跳过错误断言。

## 验证边界

本地已完成 293 项前端测试、类型、lint、生产构建及双主题 56 组尺寸验证，详见前一份报告。此次仅前端发布，未运行后端完整回归或付费模型调用。Windows Edge 尺寸验证不能替代 iPad/Safari 实机验收。

发布脚本、HTTP/浏览器检查脚本及 JSON 结果保存在忽略目录 `.artifacts/`；线上截图位于 `output/playwright/deploy-20261026/`。这些验证产物不进入产品运行或源码归档。
