# Devlog：MiniMax M3 默认模型升级

## 改动

- `app/scripts/backfill-digest-structured.mjs` 默认 `LLM_MODEL` fallback 从 `MiniMax-M2.7` 改为 `MiniMax-M3`。

## 稳定性与安全门禁

- 风险等级：P2，涉及外部 AI provider 默认模型。
- 未修改 API key、endpoint、prompt、输出结构、digest UI 或已有无关页面改动。

## 验证

- `node --check app/scripts/backfill-digest-structured.mjs` 通过。
- `git diff --check -- <本次改动文件>` 通过。
- 全局当前代码默认值复扫：未发现仍需升级的 Pola 可用项目 M2.7 默认值；剩余命中为历史日志、需求文字、备份或外部参考。

## 风险

- M3 输出风格可能不同；可通过 `LLM_MODEL` 环境变量回滚。
