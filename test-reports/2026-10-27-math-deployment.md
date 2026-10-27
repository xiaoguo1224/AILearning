# 2026-10-27：公式修复发布状态

## 已完成

- 用户明确授权提交、推送和服务器部署。功能提交 `5afe0fc13ff4f032487c988e5d9731dd6c6bec78` 已推送到 `origin/main`；`git ls-remote` 核对一致。
- 发布前 SSH 核验 `/opt/studyforge/current` 指向 `/opt/studyforge/releases/513e3cb-20261026`；两个服务 active，后端 PID 509447；磁盘可用 5.4G。使用既有 `persondate-vps` SSH 配置及密钥，无密码或配置变更。
- 本次前端 BUILD_ID `eKcit3x3GUqz6Er863Zoq`，来源为本轮已通过的生产构建。Git archive 源码包与前端包已上传到 `/opt/studyforge/staging/5afe0fc-20261027/`。

| 包 | SHA256 |
| --- | --- |
| source.tar | f4f1e905aecb03bbee0758cc5b0e291145677382ef32a16f9e1e4e4b1ceac03a |
| frontend.tar.gz | 92eb92695fed16224286ca1ea6e6292bd4bc3f1cd2951e57a007c82ae1635916 |

- 复用既有原生发布脚本，核验源码/产物哈希、后端源码不变和新 BUILD_ID；在新 release 内独立执行 `npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org`，不修改旧版依赖树。
- 脚本设计为依赖一致性验证和数据/配置备份完成后才切换 current，只重启前端；健康检查失败自动切回旧版本。没有本地库覆盖线上库或后端重启操作。
- 线上只读定位到截图课时：课程 3 / 课时 24「11 Dataset 与 DataLoader」。已准备 HTTPS 门禁/静态资源版本检查与双主题、多尺寸公式浏览器验收脚本。

## 尚未完成：连接中断

独立依赖安装开始后，部署 SSH 会话持续无新输出，后续 SSH 多次在 banner exchange 阶段超时；HTTPS `/login` 也多次连接超时。安装日志尚未成功读回，无法确认安装完成、是否切换 current 或服务健康。原因未确定，不能将时间上的先后关系当作内存耗尽或安装导致故障的结论。

源码包第一次归档在错误工作目录失败，已更正；第一次尝试执行发布时前端包仍在上传，哈希守卫拒绝执行且尚未创建 release。确认 scp 完整结束后才重新执行，当前等待的是这一次部署会话。没有绕过任何哈希校验。

当前不能声称部署、备份或线上验收已完成，也不能将发布前服务状态当作当前状态。已请求用户从云服务器控制台查看实例、内存与负载；未擅自重启整台服务器或影响既有模型网关。

## 恢复后的处理顺序

1. 先检查仍在等待的部署会话、安装日志、current 指向、两个 systemd 服务和后端 PID；不要重复执行仍在运行的发布脚本。
2. 按实际状态处理：若已完成，直接验收；若仍安装，先诊断资源/网络；若失败且 current 未切换，保留旧版并修复新 release；若新版本不可用，则按既有原子链接方式回滚前端，保留线上数据。
3. 确认 SQLite 备份和 manifest，再进行 HTTPS 登录/退出、KaTeX 0.19.1 样式、截图课时分数线/分子位置和双主题视口检查，最后记录最终发布结果。

部署与验收脚本及产物位于忽略目录 `.artifacts/`；本次不新增运行期自动化。原本地测试及构建证据见 `2026-10-27-math-rendering.md`，不能代替服务器验收。
