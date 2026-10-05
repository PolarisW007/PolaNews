# Release：生产稳定性修复与近一周内容再生成

状态：Fully deployed / Complete
环境：production
风险：P1

## 发布面

- Next.js standalone 后端与 API。
- PostgreSQL 兼容性列和近一周文章缓存字段。
- Supervisor 环境变量与进程重启。
- 音频文件存储、retention 和一次性清理。
- MiniMax/TTS 真实批处理。

## 发布前检查

- 备份 `.env.local`、Supervisor 配置、目标数据库行和音频 manifest。
- dry-run 核对候选数/字节、路径边界和引用保护。
- lint/build/deploy doctor、测试矩阵和 secret scan 通过。
- 当前首页/API/PostgreSQL 基线证据已保存。

## 发布步骤

1. 先受控释放足够构建空间，不修改文章正文或用户数据。
2. 在构建前配置绝对 `POLANEWS_AUDIO_DIR` 和临时 scheduler 状态。
3. 上传本 hotfix 的明确文件清单并在服务器构建，再配置 30 天 retention 与 ops token。
4. Supervisor `reread/update`，执行核心 smoke。
5. 备份并重置近一周目标缓存字段；分批再生成摘要和音频。
6. 核对完成/失败/checkpoint，恢复正常 scheduler。
7. 观察磁盘、数据库、5xx、RSS、MiniMax/TTS 日志。

## 实际发布进度

- 已部署 `78bbd45b512a3319abec4ec68a7ebd349c073444` 与 scheduler 总闸门追加修复 `efc434e06b7e50025251b4d0a12d3daa4f50dc82`。
- 生产 Key 经脱敏验证属于 `api.minimaxi.com/v1` 区域，模型使用 `MiniMax-M3`；`api.minimax.io/v1` 对该 Key 返回 `invalid api key`。
- `POLANEWS_SCHEDULER_DISABLED=1` 已在生产阻止 bootstrap 和 cron，维护期不会与自动抓取并发。
- 代码门禁已通过：稳定性测试 17/17、TypeScript、目标 ESLint、production build 与 deploy doctor。
- 固定窗口 `2026-09-29T00:00:00+08:00` 至 `2026-10-06T02:40:09+08:00`：原有 393 篇完成重置和再生成，恢复抓取后另有 2 篇新增文章按 `published_at` 归入该窗口并自动处理；最终摘要与音频均覆盖 395/395，pending=0、失败=0。
- 数据库六项聚合均为 395；395 个音频文件缺失=0、零字节=0、非法文件名=0，总大小 140,262,480 bytes。首、中、末 3 条 HTTP 均为 200 `audio/mpeg`，响应大小 209,808 / 330,480 / 346,896 bytes。
- Scheduler 已恢复为 `POLANEWS_SCHEDULER_DISABLED=0` 并注册 3 个 cron；bootstrap 完整结果为 feeds attempted=6、succeeded=2、failed=4、recovered=0、new articles=7、translated=77、summarized=14、classified=42、audio synthesized=16。
- 真实 MiniMax `422 new_sensitive` 已按 10→5→2→1 隔离；仅跳过命中的单篇叶子项（可能多条），其余文章继续处理。受控 feed canary 失败/恢复均通过并完成清理，残留 0；最终 active=2、error=55、due=1、future=54，A12 通过。
- 当前磁盘可用 7.5 GiB，使用率 85%。
- 最终服务 PID 667658、RUNNING，Git HEAD `efc434e`；音频目录约 3.5 GiB。localhost 核心路由和公网 `https://aipd.me/polanews` 返回 200，匿名 history 返回 401，PostgreSQL accepting connections。
- 精确字段备份：`/private/tmp/polanews-prod-backup-20261006T0200/week-article-ai-fields-exact.csv.gz`，SHA-256 `93613e713824b2f0a0271100235e287b5cf18524a37e833a83508dab2eaa5b54`。
- 最终窗口离线快照：`/private/tmp/polanews-prod-backup-20261006T0200/week-article-ai-fields-final.csv.gz`，gzip 校验通过，396 行含表头（395 条数据），SHA-256 `b0e479a1b00d4972e55e190ec8dc5e8bd27ca581247df8e36caecc85470d6b7a`。
- Scheduler 恢复前 feeds 快照：`/private/tmp/polanews-prod-backup-20261006T0200/feeds-before-scheduler-restore.csv.gz`，SHA-256 `4cedad56c159ce0183c7941d5b21753dfd352feca8bcf172f655ef7899d5962b`。

## 回滚

- 恢复服务器代码、构建目录和 Supervisor 配置备份，再 `reread/update`。
- 恢复近一周文章缓存字段备份；兼容性 feed 列可保留。
- 音频删除按 manifest 可识别但无法原地恢复；通过缓存字段清空和再生成补偿。

## Ready 条件

需求 A1-A12 均有生产证据，无未处理 P0/P1；代码、服务、近一周再生成、scheduler 完整周期、受控恢复 canary、真实音频和公网入口均验收通过。发布状态为 Fully deployed / Complete。
