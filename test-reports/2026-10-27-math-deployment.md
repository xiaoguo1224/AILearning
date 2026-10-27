# 2026-10-27：公式修复已发布

## 最终发布结果

- 应用版本 `/opt/studyforge/releases/5afe0fc-20261027`，前端 BUILD_ID `eKcit3x3GUqz6Er863Zoq`。KaTeX 0.19.1 已在服务器实际生效，源码修复 `5afe0fc` 已推送到 origin/main。
- 用户重启服务器后，先核验旧版仍在运行、安装未完成且无残留发布进程，再恢复发布。最终只重启前端；前端 PID 5385、后端 PID 1523，后端 PID 与恢复发布前一致，两者 active、NRestarts=0；后端 `/health` 返回 status=ok。
- HTTPS 门禁、登录/退出、课程页、题目页、50 个 JS/CSS 资源、KaTeX 0.19.1 样式及原模型网关未认证 401 均通过。真实 Edge 双主题 × 课程/题目 × 1440/1194/390px，共 12 组公式/布局检查通过；无浏览器错误或答题/生成等业务写请求。下方保留故障与恢复依据。

## 发布准备

- 用户明确授权提交、推送和服务器部署。功能提交 `5afe0fc13ff4f032487c988e5d9731dd6c6bec78` 已推送到 `origin/main`；`git ls-remote` 核对一致。
- 发布前 SSH 核验 `/opt/studyforge/current` 指向 `/opt/studyforge/releases/513e3cb-20261026`；两个服务 active，后端 PID 509447；磁盘可用 5.4G。使用既有 `persondate-vps` SSH 配置及密钥，无密码或配置变更。
- 本次前端 BUILD_ID `eKcit3x3GUqz6Er863Zoq`，来源为本轮已通过的生产构建。Git archive 源码包与前端包已上传到 `/opt/studyforge/staging/5afe0fc-20261027/`。

| 包 | SHA256 |
| --- | --- |
| source.tar | f4f1e905aecb03bbee0758cc5b0e291145677382ef32a16f9e1e4e4b1ceac03a |
| frontend.tar.gz | 92eb92695fed16224286ca1ea6e6292bd4bc3f1cd2951e57a007c82ae1635916 |

- 复用既有原生发布脚本，核验源码/产物哈希、后端源码不变和新 BUILD_ID。首次在新 release 内执行独立 `npm ci`，没有修改旧版依赖树；该安装未完成，最终采用下述经过差异核验的依赖复制方式。
- 脚本设计为依赖一致性验证和数据/配置备份完成后才切换 current，只重启前端；健康检查失败自动切回旧版本。没有本地库覆盖线上库或后端重启操作。
- 线上只读定位到截图课时：课程 3 / 课时 24「11 Dataset 与 DataLoader」；题目入口为课程 3 / 题目 132。

## 故障诊断与恢复

首次独立依赖安装开始后 SSH/HTTPS 超时，当时无法确认原因，已如实记录阻塞并提交 `bab9e6c`。用户随后重启服务器。恢复后读取上一轮内核日志，确认 16:40:55 有 `npm ci invoked oom-killer`；实例总内存约 1888MiB、swap 1024MiB。不能在该实例重复无约束安装。

重启后的前后端正常，但 HTTPS 为 502。Nginx 启动日志明确报 `bind() to 172.18.0.1:8081 failed (99: Cannot assign requested address)`：启动时 Docker 网桥还未就绪。确认桥接地址已存在且 `nginx -t` 通过后启动 Nginx，HTTPS 恢复 200。部署 `nginx.service.d/studyforge-network.conf`，增加 `Wants=docker.service` 与 `After=docker.service`；daemon-reload 后实际核对生效依赖。文件 SHA256 为 `091121f84cf837720071cbcdb425754e0511f9f65a13544d64930bd4e5f9ffc7`，与仓库文件一致。保留既有站点、模型网关和入口配置。

恢复时将 npm 安装放入独立 systemd scope，限制内存 384MiB、CPU 50%、Node heap 256MiB 和 300 秒超时；服务器原 npm 10.9.4 与对齐本机的隔离 npm 11.3.0 都因资源上限终止，均在切换前停止，没有取消资源限制或跳过 peer 检查，也未改变服务器全局 npm。

## 最终依赖准备与备份

逐项比较新旧 lockfile：根依赖只改变 KaTeX 要求，实际包只有根 KaTeX 升级；删除 Mermaid/rehype-katex/micromark 下三份旧 KaTeX 和两份旧 commander，其余包字段全部相同。用 `cp -a` 完整复制已验证的旧 Linux 依赖到新 release；通过 KaTeX 和 Next.js 的 package.json inode 检查确认没有与旧版本共享硬链接。失败安装目录移到 staging 留存，没有删除旧 release。

新副本中移除已从 lockfile 删除的包及旧根 KaTeX，解包官方 KaTeX 0.19.1 tarball；本机先校验其 SHA512 与新 lockfile 完全相同，服务器再核对包 SHA256。删除新依赖树中过期的隐藏 `.package-lock.json` 缓存，保留正式项目 lockfile。服务器实际断言 KaTeX 为 0.19.1，并验证 rehype-katex、Mermaid、micromark-extension-math 的解析路径均等于根 KaTeX。

只在核验后执行备份与原子切换。备份 `/opt/studyforge/backups/5afe0fc-20261027` 为 0700，包含 SQLite backup API 一致快照（quick_check=ok）、资料、附件和 0600 环境文件，以及 before-release-manifest.json / release-result.json。旧 release 保留；需要回滚时仅切回 `513e3cb-20261026` 并重启前端，不恢复旧数据库、不覆盖新增学习记录。

## 线上验收与边界

实际执行：

```text
backend/.venv/Scripts/python.exe .artifacts/verify-math-online.py
node .artifacts/verify-math-online.cjs
```

浏览器脚本由 Python dotenv 包装器注入临时进程环境中的访问密码，没有写入脚本或输出。HTTP 验证包括公开首页/登录 200、匿名课程页 307、匿名数据 API 和模型入口 401、登录后目标课时与题目 200、Secure/HttpOnly Cookie、50 个 JS/CSS 资源 200、最新样式版本字符串以及退出撤权。

12 组在线浏览器检查断言公式存在且无 katex-error、分数线宽度/边框非零、分子位于横线上方，整页不溢出。等待客户端网络与字体加载完成后再截图，人工查看浅色平板和深色手机课时截图。除登录/退出和既有课程阅读计数外无业务写请求，无 pageerror/console error；未改题目、提交答案、生成内容或调用付费模型。

线上脚本及 JSON 在 `.artifacts/`，最终截图在 `output/playwright/deploy-math-20261027/`。未进行 Safari 实机、再次整机重启或后端完整回归；Nginx 顺序已配置并核对，未以再次重启整台服务器验证。原本地 298 条测试、构建、类型/lint 与图表 smoke 证据见 `2026-10-27-math-rendering.md`。服务器 systemd 生产运行及线上检查补齐了此前本机生产启动被拒绝的验证边界。

首次错误工作目录归档和上传未完成时的哈希拒绝均未切换版本，已更正；没有绕过校验。本次不新增运行期自动化或数据库迁移。
