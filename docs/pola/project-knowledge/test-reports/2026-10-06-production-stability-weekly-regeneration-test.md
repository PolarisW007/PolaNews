# 测试报告：生产稳定性修复与近一周内容再生成

日期：2026-10-06
状态：PASS / Complete
分支：`codex/hotfix-2026-10-06-polanews-stability`

## 测试对象

- 首个生产热修：`78bbd45b512a3319abec4ec68a7ebd349c073444`。
- Scheduler 总闸门追加修复：`efc434e06b7e50025251b4d0a12d3daa4f50dc82`。
- 再生成窗口：`2026-09-29T00:00:00+08:00` 至 `2026-10-06T02:40:09+08:00`；原有 393 篇完成重置与再生成，恢复抓取后新增 2 篇同窗口文章，最终覆盖 395 篇。

## 自动化与构建门禁

| 检查 | 结果 | 证据摘要 |
| --- | --- | --- |
| Stability tests | PASS | 17/17；含 scheduler disabled 不触发 bootstrap 的追加回归用例 |
| TypeScript | PASS | `tsc --noEmit --incremental false` |
| Target ESLint | PASS | 0 error / 0 warning |
| Local production build | PASS | Next production build 完成 |
| Server independent build | PASS | 独立生产服务器 worktree 构建完成 |
| Deploy doctor | PASS | 本地与服务器部署检查通过 |
| Review gate | PASS | 0 个未解决 P0/P1 |

## 生产验证

| 验收项 | 状态 | 生产证据 |
| --- | --- | --- |
| A1-A3 磁盘与 retention | PASS | 精确清理 27,154 个过期 UUID MP3（8,317,215,792 bytes）；35,487 条失效音频引用已事务修复，无文章删除；当前磁盘可用 7.5 GiB、使用率 85% |
| A5 MiniMax 隔离与配置 | PASS | 单条失败隔离已由测试覆盖；脱敏探针确认 Key 在 `api.minimaxi.com/v1` 有效，`api.minimax.io/v1` 返回 `invalid api key`；模型为 `MiniMax-M3` |
| A6 Digest 日期 | PASS | date-only 归一化测试通过，生产 digests 入口 smoke 通过 |
| A7 近一周摘要 | PASS | 原有 393 篇完成重置与再生成，另有 2 篇恢复抓取后自动处理；固定窗口最终 395/395 篇摘要完成 |
| A7 近一周音频 | PASS | 固定窗口最终 395/395 完成，pending=0、失败=0；六项 DB 计数均为 395；395 个文件缺失=0、零字节=0、非法名=0 |
| A8 核心入口 | PASS | 首页、articles、feeds、digests、broadcast 返回 200；匿名 history 返回预期 401；首、中、末 3 条音频均返回 200 `audio/mpeg` |
| A10 维护安全 | PASS | ops token 未进入代码/文档/响应，服务器侧文件权限为 600 |
| A11 部署 | PASS | 两个提交均已部署；Supervisor PID 667658 RUNNING、Git HEAD `efc434e`、PostgreSQL accepting；原有 393 篇再生成完成且最终窗口 395 篇全覆盖 |
| A12 scheduler 恢复观察 | PASS | `POLANEWS_SCHEDULER_DISABLED=0`、3 个 cron；bootstrap 完整结束，受控 feed canary 失败/恢复均通过且残留 0 |

## 数据备份证据

- 文件：`/private/tmp/polanews-prod-backup-20261006T0200/week-article-ai-fields-exact.csv.gz`
- SHA-256：`93613e713824b2f0a0271100235e287b5cf18524a37e833a83508dab2eaa5b54`
- 最终窗口离线快照：`/private/tmp/polanews-prod-backup-20261006T0200/week-article-ai-fields-final.csv.gz`
- 最终快照验证：gzip OK，396 行含表头（395 条数据），SHA-256 `b0e479a1b00d4972e55e190ec8dc5e8bd27ca581247df8e36caecc85470d6b7a`
- Feeds 恢复前快照：`/private/tmp/polanews-prod-backup-20261006T0200/feeds-before-scheduler-restore.csv.gz`
- Feeds 快照 SHA-256：`4cedad56c159ce0183c7941d5b21753dfd352feca8bcf172f655ef7899d5962b`

## 音频完整性证据

- 数据库：`total`、`summary`、`keypoints`、`audio_url`、`audio_text_hash`、`unique audio URL` 六项均为 395。
- 文件：总数 395，缺失 0、零字节 0、非法文件名 0；总大小 140,262,480 bytes，最小 187,776 bytes，最大 722,592 bytes。
- HTTP：首、中、末样本均返回 200 `audio/mpeg`，大小分别为 209,808、330,480、346,896 bytes。

## Scheduler、隔离与恢复证据

- Bootstrap：feeds attempted=6、succeeded=2、failed=4、recovered=0、new articles=7、translated=77、summarized=14、classified=42、audio synthesized=16。
- 生产真实 MiniMax `422 new_sensitive`：批次按 10→5→2→1 递归隔离；仅跳过命中的单篇叶子项（可能多条），其余文章继续处理。
- 受控 feed canary：失败证据 `error|3|3600|t|f`；恢复证据 `active|0|next_retry_null=true|last_fetched=true|articles=0`；清理后残留 0。
- 最终 feed 快照：active=2、error=55、due=1、future=54；一个源由时间推进进入 due，不构成退避失效。

## 最终生产运行态

- 服务：Supervisor PID 667658，RUNNING；Git HEAD `efc434e`。
- 配置：`MiniMax-M3`、`https://api.minimaxi.com/v1`、scheduler disabled=0、持久音频目录正确。
- 健康：localhost 关键路径 200、匿名 history 401、公网 `https://aipd.me/polanews` 200、PostgreSQL accepting connections。
- 容量：磁盘可用 7.5 GiB、使用率 85%；音频目录约 3.5 GiB。

## 残余风险

- 缺失文件异常阈值仍是启发式判断，小规模局部缺失可能需要人工复核。
- 清理采用“先修数据库引用、后 unlink”以避免断链；若 unlink 失败，可能留下无引用文件，后续 retention 可再次处理。
- 持续失败的维护项可能阻塞队头；当前以无进展停止条件和 checkpoint 暴露剩余项。
- 锁为进程内锁，retention 没有总超时；发布期通过单实例 Supervisor 和 scheduler 总闸门降低并发风险。

## 最终结论

A1-A12 全部通过。代码门禁、生产部署、近一周再生成、真实音频、scheduler 完整 bootstrap、MiniMax 敏感内容隔离、feed 失败/恢复 canary 与公网入口均取得可核验证据；交付状态为 Complete / Fully deployed。
