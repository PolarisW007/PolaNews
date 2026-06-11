# SDD：MiniMax M3 默认模型升级

## 架构影响

本次只调整 digest 结构化补写脚本的默认模型字符串。现有 `LLM_API_BASE`、请求流程、prompt、JSON 输出结构和历史内容不变。

## 数据流

新闻条目 -> prompt -> MiniMax M3 -> digest JSON -> 后续写入流程。

## 安全与性能

- 不新增 secret。
- 不新增定时任务、并发、数据库 schema 或文件 IO。
- `LLM_MODEL` 仍可覆盖默认值，用于快速回滚。

## 回滚

设置 `LLM_MODEL=MiniMax-M2.7` 即可临时回滚；代码层面可恢复默认字符串。
