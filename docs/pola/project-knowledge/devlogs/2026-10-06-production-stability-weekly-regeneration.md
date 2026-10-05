# 开发日志：生产稳定性修复与近一周内容再生成

日期：2026-10-06
状态：Complete / Fully deployed

## 目标

修复生产磁盘、RSS 自动恢复、MiniMax 批次隔离和 Digest 日期问题，并重新生成固定窗口 `2026-09-29T00:00:00+08:00` 至 `2026-10-06T02:40:09+08:00` 的摘要与音频。

## 基线与隔离

- 生产基线：`6a92017b5f726159061a6d63724710fd47bacb2a`。
- 使用独立 managed worktree；未修改原始 `main` 的既有脏文件。
- 当前任务已获得生产修复、清理、再生成和必要重启授权。

## 风险门禁

- P1：根盘 100%、RSS 52/57 永久失活、翻译连续失败。
- 任何删除前执行 dry-run、引用扫描、数据库/配置备份和 manifest。
- 不记录任何 API Key、JWT、cookie 或 ops token。

## 实现、验证与发布

### 提交与实现

- `78bbd45b512a3319abec4ec68a7ebd349c073444`（`fix: stabilize PolaNews production pipelines`）已部署：实现 feed retry/backoff、MiniMax 敏感内容二分隔离、Digest date-only 归一化、音频 retention、受 token 保护的有界维护 API 及续跑脚本。
- `efc434e06b7e50025251b4d0a12d3daa4f50dc82`（`fix: fully disable scheduler bootstrap during maintenance`）已追加部署：将 `POLANEWS_SCHEDULER_DISABLED=1` 提升为 bootstrap 与 cron 共用的总闸门，并增加回归用例。
- 生产运行目录使用 `POLANEWS_AUDIO_DIR=/opt/polanews-runtime/audio`；维护期间 scheduler 总闸门已在生产生效。

### 生产止血与备份

- 清理前根分区已满；通过受控 manifest 清理 27,154 个超过 30 天且未受保护的 UUID MP3，逻辑大小 8,317,215,792 bytes，并事务性清空 35,487 条失效文章音频缓存引用；未删除文章记录。
- 清理后根分区恢复约 8.1 GiB 可用，部署构建后约 7.7 GiB 可用；再生成完成且 scheduler 恢复后为 7.5 GiB 可用、使用率 85%。
- 固定周窗口字段精确备份：`/private/tmp/polanews-prod-backup-20261006T0200/week-article-ai-fields-exact.csv.gz`。
- 备份 SHA-256：`93613e713824b2f0a0271100235e287b5cf18524a37e833a83508dab2eaa5b54`。
- 最终窗口离线快照：`/private/tmp/polanews-prod-backup-20261006T0200/week-article-ai-fields-final.csv.gz`；gzip 校验通过，共 396 行（表头 1 + 数据 395），SHA-256 `b0e479a1b00d4972e55e190ec8dc5e8bd27ca581247df8e36caecc85470d6b7a`。
- Scheduler 恢复前 feeds 快照：`/private/tmp/polanews-prod-backup-20261006T0200/feeds-before-scheduler-restore.csv.gz`，SHA-256 `4cedad56c159ce0183c7941d5b21753dfd352feca8bcf172f655ef7899d5962b`。
- 生产回滚分支：`backup/prod-20261006-0200`；Supervisor 配置和原构建另有服务器侧备份。

### MiniMax 区域与模型

- 不记录用户 Key 原文，仅记录脱敏探针结果：Key 在 `https://api.minimaxi.com/v1` 可用，在 `https://api.minimax.io/v1` 返回 `invalid api key`。
- 生产模型保持 `MiniMax-M3`，base URL 使用 `api.minimaxi.com/v1`。

### 代码门禁

- `npm run test:stability`：17/17 通过。
- `tsc --noEmit --incremental false`：通过。
- 目标 ESLint：0 error / 0 warning。
- 本地生产 build、独立生产服务器 build 与 deploy doctor：通过。
- 独立 review：0 个未解决 P0/P1；残余 P2 风险保留在测试报告。

### 生产发布与回归

- Supervisor 服务运行新构建；PostgreSQL accepting connections。
- `/polanews`、articles、feeds、digests、broadcast 公共入口返回 200；匿名 history 返回预期 401。
- `POLANEWS_SCHEDULER_DISABLED=1` 已验证不会触发 instrumentation bootstrap，避免再生成与自动抓取重叠。

### 近一周再生成进度

- 固定窗口：`2026-09-29T00:00:00+08:00` 至 `2026-10-06T02:40:09+08:00`。
- 初始目标 393 篇已全部重置并再生成；scheduler 恢复抓取后新增文章中有 2 篇的 `published_at` 落入同一固定窗口并被自动处理，最终窗口文章为 395 篇。
- 中文摘要：最终 395/395 已完成。
- 中文音频：最终 395/395 已完成，`audio_pending=0`、失败=0。
- 数据库六项计数 `total` / `summary` / `keypoints` / `audio_url` / `audio_text_hash` / `unique audio URL` 均为 395。
- 文件核验：395 个目标文件，缺失=0、零字节=0、非法文件名=0；总大小 140,262,480 bytes，最小 187,776 bytes，最大 722,592 bytes。
- 首、中、末 3 条真实音频请求均返回 HTTP 200 和 `audio/mpeg`，响应大小分别为 209,808、330,480、346,896 bytes。

### Scheduler 恢复与 A12 验收

- `POLANEWS_SCHEDULER_DISABLED=0` 已生效，3 个 cron 已注册。
- Bootstrap 已完整结束：feeds attempted=6、succeeded=2、failed=4、recovered=0、new articles=7、translated=77、summarized=14、classified=42、audio synthesized=16。
- 生产出现真实 MiniMax `422 new_sensitive`，批次按 10→5→2→1 递归隔离；仅跳过命中的单篇叶子项（可能多条），其它文章继续处理。
- 受控 feed canary 失败证据为 `error|3|3600|t|f`；恢复证据为 `active|0|next_retry_null=true|last_fetched=true|articles=0`。Canary 已清理，数据库残留 0。
- 最终 feed 状态 active=2、error=55、due=1、future=54；这是观察时钟推进后一个源正常到期，不是无界重试或永久失活。A12 通过。

### 最终运行态

- Supervisor `polanews` PID 667658，状态 RUNNING；生产 Git HEAD 为 `efc434e`。
- 模型 `MiniMax-M3`，base URL `https://api.minimaxi.com/v1`，scheduler disabled=0，持久音频目录配置正确。
- 本机关键路径返回 200，匿名 history 返回预期 401；公网 `https://aipd.me/polanews` 返回 200；PostgreSQL accepting connections。
- 最终磁盘可用 7.5 GiB、使用率 85%，持久音频目录约 3.5 GiB。
- A1-A12 均已取得验收证据，交付状态更新为 Complete / Fully deployed。

## 外部同步

N/A：本次用户授权生产修复，但未授权钉钉需求池或开发日志外部写入；保留本地工程记录。
