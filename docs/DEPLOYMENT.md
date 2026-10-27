# 原生 Linux 部署

## 运行结构

本项目的 Next.js 与 FastAPI 直接由 systemd 以 `studyforge` 非登录用户运行，不创建应用容器。当前服务器复用已有 HTTPS 入口及其证书续期；该既有 Caddy 入口由服务器原有容器管理，不属于本项目运行时。HTTPS 的 `/v1/*`、`/v1beta/*` 继续由原模型网关处理，其余路径转发至本项目。

```text
HTTPS :443 → 既有 Caddy → Nginx 172.18.0.1:8081
                      → Next.js 127.0.0.1:3000
                      → 同源 /backend/* → FastAPI 127.0.0.1:8000
```

内部地址 `172.18.0.1` 是当前 HTTPS 入口所在网络的宿主机地址。迁到其他服务器时必须检查并修改 `deploy/nginx.conf` 与 `deploy/caddy-handle.caddy`，不能直接照搬。不要将 3000、8000、8081 端口开放到公网。

| 路径 | 职责 |
| --- | --- |
| `/opt/studyforge/releases/<版本>` | 源码与匹配的前端生产构建 |
| `/opt/studyforge/current` | 当前发布版本软链接 |
| `/opt/studyforge/runtime/venv` | 独立 Python 运行环境 |
| `/etc/studyforge/backend.env` | 后端密码、模型配置及数据路径，root:root / 0600 |
| `/etc/studyforge/frontend.env` | 前端服务端配置，不包含模型密钥 |
| `/var/lib/studyforge/studyforge.sqlite3` | 正式学习数据库 |
| `/var/lib/studyforge/resources` | 原始资料文件 |
| `/var/lib/studyforge/attachments` | 答案附件原始文件 |
| `/opt/studyforge/backups` | 上线前快照、核验清单和入口回滚配置，0700 |

## 安装与发布

1. 检查已有端口、站点、磁盘、可用内存及 swap；安装 Node.js（满足当前 Next.js 的最低版本）和 Python 3.11+。当前使用 Node.js 22.22.0、Python 3.11.13、uv 0.10.9。此服务器总内存约 1.9GiB，不能将开发机上可完成的安装视为服务器也有足够内存，低内存发布限制见下文。
2. 创建系统用户 `studyforge`，创建上述目录。源码与运行环境由 root 管理，只有数据目录和前端 `.next/cache` 允许服务用户写入。
3. 用 `git archive` 导出明确版本，避免打包 `.env`、本机虚拟环境、数据库与缓存。前端先运行 `npm ci`、`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`。发布匹配源码的 `.next` 产物，排除开发与构建缓存；服务器在 `frontend/` 执行 `npm ci --omit=dev --no-audit --no-fund`，安装 Linux 原生运行依赖。本次构建在 Windows 完成，Linux 安装本机依赖后以实际 HTTP 与浏览器验证可运行性；跨系统升级必须重新验收。
4. 用 `uv export --project backend --frozen --no-dev --no-emit-project --format requirements-txt` 导出锁定依赖，再用服务器独立虚拟环境的 `uv pip install --require-hashes -r <requirements.txt>` 安装。不要安装到系统 Python。
5. 配置后端环境文件：保留原 `ADMIN_PWD` 和模型配置，设置如下服务器路径。秘密只通过加密 SSH 传输，不提交到 Git、部署日志或前端环境。

```dotenv
STUDYFORGE_DB=/var/lib/studyforge/studyforge.sqlite3
STUDYFORGE_DATA_DIR=/var/lib/studyforge/resources
STUDYFORGE_ATTACHMENTS_DIR=/var/lib/studyforge/attachments
STUDYFORGE_CORS_ORIGINS=https://<实际访问主机>,https://localhost:3000
STUDYFORGE_TIMEZONE=Asia/Shanghai
PYTHONDONTWRITEBYTECODE=1
```

前端环境文件：

`https://localhost:3000` 是此启动方式下 Next.js Proxy 根据监听主机和转发协议生成并规范化的内部 Origin，仅用于 SSR 会话校验。遗漏时会出现「登录成功，但业务页面返回 503」。它不是额外公网地址；前端仍只监听回环 HTTP，浏览器写请求仍需满足公开 HTTPS Origin 和跨站校验。

```dotenv
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
API_INTERNAL_URL=http://127.0.0.1:8000
NODE_OPTIONS=--max-old-space-size=256
```

6. 将 `deploy/systemd/*.service` 安装到 `/etc/systemd/system/`，创建 `.next/cache` 并赋予 `studyforge` 用户写权限，设置 `current` 链接。运行 `systemd-analyze verify`、`systemctl daemon-reload`、`systemctl enable --now studyforge-backend studyforge-frontend`。
7. 先核验 `http://127.0.0.1:8000/health` 和前端，再将 `deploy/nginx.conf` 安装到已有 Nginx 的站点 include 目录。将 `deploy/systemd/nginx.service.d/studyforge-network.conf` 安装到 `/etc/systemd/system/nginx.service.d/`，执行 `systemctl daemon-reload`，使 Nginx 在 Docker 启动后再绑定桥接地址；否则重启时桥接地址尚未创建，Nginx 会启动失败并使 HTTPS 返回 502。执行 `nginx -t` 后 reload，若服务未运行则 start。不要覆盖已有 Nginx 主配置或其他站点。
8. 备份当前 HTTPS 入口配置，仅将最终 404 fallback 换为 `deploy/caddy-handle.caddy` 内容。使用既有入口的管理方式验证并热加载。保留模型路由、TLS 策略、证书续期及其配置。最后检查 HTTPS 证书、匿名访问隔离、登录/退出、SSR、课程、附件和原模型网关。

## 低内存服务器的依赖更新

2026-10-27 的默认 `npm ci` 曾触发内核 OOM；安装器与本机版本一致也不能代替资源预算。安装进程应置于独立 systemd scope，限制内存和 CPU，并使用显式超时及 Node heap 上限；限制内失败须停止发布、保留旧版本，不能通过取消限制反复尝试。当前实例 `MemoryLimit=384M`、`CPUQuota=50%`、heap 256MiB 的安装仍会被限制终止，不应作为已验证可行的完整安装命令。

本次 KaTeX 发布采用经过核验的有限替代流程：逐项比较新旧 lockfile，确认只有根 KaTeX 升级及其旧嵌套副本/旧 commander 删除；使用 `cp -a` 完整复制旧版 Linux 依赖到新 release，校验文件 inode 不与旧版共享；移除该新副本内的旧包，将与新 lockfile SHA512 相同的官方 KaTeX tarball 解包至新目录。删除新副本内旧的 `.package-lock.json` 优化缓存，保留项目正式 lockfile。随后检查每个数学渲染入口都解析到 KaTeX 0.19.1，并进行真实运行验收。

该流程仅适用于已逐项证明的有限依赖差异；其他依赖变化仍应在资源充足、平台一致的构建环境安装并验证，不可直接复制一棵任意旧依赖树。禁止在通过硬链接共享的依赖树内安装或原地改写文件，避免破坏回滚版本。具体证据见 `test-reports/2026-10-27-math-deployment.md`。

## 一次性完整迁移与核验

本次为一次性迁移；切换后以网站数据为准，不进行本地与网站双向同步。切换时不要继续向本地应用写入数据。

- 通过 SQLite `Connection.backup()` 获取一致快照，不能直接复制正在写入的主库并遗漏 WAL。确认没有 pending/running 作业，避免两端重复执行模型任务。
- 快照保留全部业务表、课程/学习/评审/会话/费用历史及附件元数据，同时完整复制资料目录和附件目录。
- 对快照记录数据库 SHA256、每张实体/索引影子表的记录数量与排序后内容 SHA256、每个文件 SHA256。服务器首次启动前核验数据库字节哈希，启动后核验逐表内容；真实登录会改变 `auth_sessions`，浏览课程可能增加阅读计数，因此必须先核验后验收。
- 附件按数据库中的哈希定位并逐项检查字节数和 SHA256；不能只核对文件数量。
- 若 `resources.path` 保存旧系统绝对路径，应在迁移副本中验证文件后仅转换路径，并单独记录差异。本次库中没有 Resource 记录，因此没有改写业务字段。
- 当前本地数据库的旧外部内容 FTS 定义引用了不存在的 `resource_chunks.chunk_id`；`PRAGMA integrity_check` 因此报错，`PRAGMA quick_check` 为 `ok`。本次保留该旧索引及原数据，核验全部物理表；这不等于完整性检查通过。该派生索引需要在后续资源检索修复中备份、重建并单独回归，不能靠删除业务记录解决。

## 维护与回滚

```bash
systemctl status studyforge-backend studyforge-frontend
journalctl -u studyforge-backend -u studyforge-frontend --since '15 minutes ago'
systemctl restart studyforge-backend studyforge-frontend
```

更新前保留旧 release、Python 依赖清单、环境文件、数据库与资料的一致备份；先验证新 release 再切换 `current` 并重启。后端含启动迁移，不能假定只切换源码就能回滚数据模型。

需要恢复上线前数据时：先停止两个服务；另外备份当前线上数据库及文件，保留网站新增的学习记录；再恢复配套数据库/资料与兼容代码，并核验清单。不得直接用旧本地库覆盖已经开始使用的网站数据库。入口回滚使用 `/opt/studyforge/backups/Caddyfile.before-studyforge-20261024`，验证后热加载，只恢复本次变更。

定期通过 SQLite backup API 备份数据库，并在暂停上传的维护窗口复制资料和附件到另一存储位置。当前没有新增自动备份任务；上线前快照不代替后续学习数据备份。
