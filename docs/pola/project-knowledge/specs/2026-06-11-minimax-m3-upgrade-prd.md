# PRD：MiniMax M3 默认模型升级

## 用户流程

- 运营或脚本任务运行 digest 结构化补写。
- 脚本读取 `LLM_API_KEY`、`LLM_API_BASE`、`LLM_MODEL`。
- 若未显式配置 `LLM_MODEL`，默认使用 `MiniMax-M3` 生成结构化 digest JSON。

## 兼容要求

- 已配置 `LLM_MODEL` 的环境继续优先使用显式模型。
- 已生成 digest 不重写。
- 前端 digest 页面行为不变化。

## 异常分支

- 缺少 API key 时保持现有 `null` 返回逻辑。
- LLM 输出异常时沿用现有解析和兜底逻辑。

## 非目标

- 不修复 PolaNews 现有页面脏改动。
- 不改 digest UI。
