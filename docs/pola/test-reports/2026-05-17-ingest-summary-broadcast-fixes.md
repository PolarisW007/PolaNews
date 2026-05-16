# PolaNews 抓取摘要与播报修复测试报告

## 结论

Pass。抓取管道、文章详情中文摘要、指定播报详情已完成线上回归。

## 测试环境

- 本地：`/Users/wangchang/Desktop/WSYCursorCode/PolaNews`
- 线上：`http://aipd.me/polanews`
- 部署目录：`/opt/polanews`
- 部署 commit：`6e90f29`
- 服务：`supervisor polanews`

## 质量门禁

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npx eslint` 针对本次改动文件 | Pass，无 error，剩余少量既有 warning |
| `npm run build` 本地 | Pass |
| `npm run build` 服务器 | Pass |

## API 验证

### 最新文章摘要

`GET http://aipd.me/polanews/api/articles?page=1&limit=1`

结果：

- `success: true`
- `title_zh`: `Zerostack——仅需8MB内存的微型Rust编程智能体`
- `ai_summary`: 已持久化中文 AI 摘要

### 指定播报

`GET http://aipd.me/polanews/api/broadcast/70dd0591-d9eb-42fa-9dcf-4bb2aea54ae5`

结果：

- `voice_id`: `longshu_v3`
- `status`: `ready`
- `segments`: 6 段
- `audio_count`: 6
- 第一段为中文开场，第二段为中文新闻内容

## 浏览器回归

| 路径 | 结果 |
| --- | --- |
| `/polanews/article/cbc77fa6-03c8-4111-ba86-86dda594aa19` | 未登录不再跳 `/login`；显示中文 AI 摘要；显示 `音频已就绪` |
| `/polanews/broadcast/70dd0591-d9eb-42fa-9dcf-4bb2aea54ae5` | 显示 `2026-03-07 新闻播报`；中文段落正常；播放器显示 `1/6段` |

浏览器 console error：0。

## 残余风险

- 全量 `npm run lint` 仍有历史 lint 债务，主要来自非本次修改页面的 React hook 规则和未转义字符。本次改动文件的 lint 无 error。
- 指定旧播报的历史 digest 原始数据偏旧，已通过人工修复脚本重写为中文播报并重新生成 6 段音频；未来新增播报由代码中的中文兜底逻辑保证。

