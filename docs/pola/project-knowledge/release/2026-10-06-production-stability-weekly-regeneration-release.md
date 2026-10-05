# Release：生产稳定性修复与近一周内容再生成

状态：Not ready（实现中）
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

## 回滚

- 恢复服务器代码、构建目录和 Supervisor 配置备份，再 `reread/update`。
- 恢复近一周文章缓存字段备份；兼容性 feed 列可保留。
- 音频删除按 manifest 可识别但无法原地恢复；通过缓存字段清空和再生成补偿。

## Ready 条件

需求 A1-A12 有证据、无未处理 P0/P1、生产 smoke 和真实再生成通过后才更新为 Deployed。
