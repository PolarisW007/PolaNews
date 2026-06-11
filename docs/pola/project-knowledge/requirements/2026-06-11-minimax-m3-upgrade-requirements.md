# 需求：MiniMax M3 默认模型升级

## 用户原始需求

用户要求把 Pola 能用到的项目中原来 MiniMax M2.7 的文字模型默认值全部切换为 M3。

## 目标

- 将 PolaNews digest 结构化补写脚本的 MiniMax 默认模型升级为 `MiniMax-M3`。
- 保持 `LLM_MODEL` 环境变量覆盖能力。
- 不影响已有 digest 页面、历史内容和无关页面改动。

## 边界

- 只修改 `app/scripts/backfill-digest-structured.mjs` 的默认模型。
- 不触碰当前已有无关脏改动 `src/app/digest/[date]/page.tsx`。
- 不修改历史报告和运行记录。

## 验收标准

- 未设置 `LLM_MODEL` 时脚本默认使用 `MiniMax-M3`。
- 脚本语法检查通过。
- 本次改动文件 diff check 通过。
