# PolaNews 抓取摘要与播报修复需求

## 背景

线上 `http://aipd.me/polanews` 已恢复页面加载，但抓取后的 AI 摘要与语音链路仍未满足产品说明：

- README 定义 RSS 聚合后应支持 AI 智能摘要、多语言翻译和新闻播报。
- 当前 `runFullIngest` 只执行标题/摘要翻译、分类和部分文章语音；中文 `ai_summary` 仍依赖进入详情页后按需生成。
- 手动抓取接口把 `audioLimit` 设为 `0`，实际不会预合成语音。
- 线上播报 `70dd0591-d9eb-42fa-9dcf-4bb2aea54ae5` 的脚本为英文，segments 文本异常为数字，音频内容与页面文字不一致。

## 需求口径

1. 每日定时抓取和手动抓取后，新文章应默认生成中文 AI 摘要并持久化到 `articles.ai_summary`，关键要点持久化到 `articles.ai_key_points`。
2. 抓取管道应默认为已具备中文摘要的最新文章合成中文音频，并持久化 `articles.audio_url`。
3. 文章详情页的摘要展示和朗读，应优先读取中文 AI 摘要；没有 AI 摘要时回退到中文翻译摘要 `summary_zh`，最后才使用原文摘要。
4. 播报生成应使用中文 Digest 内容，输出中文播报稿，并正确切分为 segments。
5. 播报播放器和详情页 on-demand TTS 应使用该播报保存的 `voice_id`，避免保存的 voice 与临时合成 voice 不一致。
6. 修复线上坏播报 `70dd0591-d9eb-42fa-9dcf-4bb2aea54ae5`。

## 非目标

- 不重做 UI 视觉设计。
- 不改数据库名称、服务名称、nginx 路径。
- 不批量重生成全部历史文章的摘要和音频，只保证增量管道和指定坏播报可修复。

## 验收标准

| 编号 | 验收项 | 验证方式 |
| --- | --- | --- |
| A1 | `runFullIngest` 返回 `summarized` 计数，并在翻译后生成 `ai_summary` | 本地/线上 API 或函数调用 |
| A2 | 手动抓取 `/api/feeds/fetch` 默认触发音频合成，不再 `audioLimit: 0` | API 响应含 `audio_synthesized` |
| A3 | 文章详情页中文摘要显示 `ai_summary || summary_zh || summary` | 浏览器/API 回归 |
| A4 | 文章朗读和预合成优先使用中文 AI 摘要 | 代码审查 + API 回归 |
| A5 | 新播报脚本为中文，segments 文本为真实中文段落，不是数字 | API/数据库验证 |
| A6 | 指定坏播报 ID 修复为中文脚本和中文音频 | 线上数据库/API 验证 |

