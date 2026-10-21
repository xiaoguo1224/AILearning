# 本地运行、备份与恢复

本项目没有账户体系，只用于可信本机。不要将开发服务或 API 文档直接公开。API Key 只放环境变量/被忽略的 `.env`；付费模型前先用 Fake 完成验收。上传代码始终只解析，不执行。

默认本机启动命令见 README。开发测试使用 `backend/` 内的 `uv run pytest <相关测试>`，前端 `npm test -- <相关测试>`；功能优先，集成节点再运行全套。Compose 是可选配置，不作为日常运行前提。

## 数据备份

升级前停止前后端写入。数据库实际位置由后端 `STUDYFORGE_DB` 决定，默认 `backend/studyforge.sqlite3`。将数据库复制到仓库外按日期命名的目录；如果数据库仍在运行或存在 WAL，使用 Python 标准库 SQLite backup API 生成一致快照，不能只复制活跃数据库主文件：

```python
import sqlite3
from pathlib import Path

source = Path("backend/studyforge.sqlite3").resolve(strict=True)
target = Path("../AILearning-backups/2026-10-20/studyforge.sqlite3")
target.parent.mkdir(parents=True, exist_ok=True)
if target.exists():
    raise FileExistsError(target)
with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as original:
    with sqlite3.connect(target) as snapshot:
        original.backup(snapshot)
        assert snapshot.execute("PRAGMA integrity_check").fetchone() == ("ok",)
```

日期目录请改为实际备份日期。资料和知识正文持久化后，必须在停止写入时与数据库一起备份；不得将个人资料、数据库或密钥提交 Git。

## 恢复与回滚

先在独立临时路径恢复快照，执行 `PRAGMA integrity_check` 并核对课程/答题/复习数量。停止服务，保留故障数据库及相关 WAL/SHM 的整套副本，再替换数据库并重启相应版本的代码。不要在服务打开数据库时覆盖主文件，也不要直接删除个人数据。迁移失败时先停服务、保留证据，从备份恢复；重复启动必须安全。

新表可以通过现有 `init_db()` 安全增加；现有表的重命名、删除、类型或约束修改须使用正式迁移，并单独提供数据保留和回滚验证。已发布 `ADDED_COLUMNS` 条目只追加、不删除。
