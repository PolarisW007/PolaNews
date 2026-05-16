# PolaNews 抓取摘要与播报修复架构

## 当前系统理解

### 抓取链路

`startFeedScheduler` 与 `/api/feeds/fetch` 都调用 `runFullIngest`。现有顺序为：

`fetchAllFeeds -> translateUntranslatedArticles -> classifyUnclassifiedArticles -> synthesizePendingAudio`

问题：

- `translateUntranslatedArticles` 只写 `title_zh/summary_zh`。
- `ai_summary` 只在文章详情页通过 `/api/articles/[id]/summarize` 懒生成。
- 手动抓取显式传入 `audioLimit: 0`。
- `synthesizePendingAudio` 更偏向 `summary_zh`，没有优先使用 AI 摘要。

### 播报链路

`/api/broadcast/generate` 读取最新 `daily_digests`，调用 LLM 生成播报稿，再用正则切分 `[段落N]`，插入 `broadcasts`，后台 `generateBroadcastAudio` 合成每段音频。

问题：

- 对 LLM 中文输出没有校验和兜底。
- segment parser 对非标准格式不够稳，历史坏数据出现 `text: "1"`。
- 播放器缺音频时使用固定 `longshu_v3`，详情预加载 fallback 使用 `longwan_v3`，未统一使用 `broadcast.voice_id`。

## 方案

1. 在 `app/src/lib/rss/engine.ts` 新增 `summarizeMissingChineseArticles(limit)`。
   - 选择 `ai_summary` 为空、且已有 `title_zh` 或 `summary_zh` 的最新文章。
   - 调用现有 `summarizeArticle(..., 'zh')`。
   - 持久化 `ai_summary` 和 `ai_key_points`。
   - 单条失败不阻塞整批。

2. 扩展 `runFullIngest`。
   - 新增 `summaryLimit` 参数。
   - 执行顺序调整为：抓取 -> 翻译 -> 中文 AI 摘要 -> 分类 -> 中文语音。
   - `IngestResult` 增加 `summarized`。

3. 修正手动抓取。
   - `/api/feeds/fetch` 传入 `summaryLimit` 和正数 `audioLimit`。
   - 响应返回 `summarized`。

4. 修正中文摘要选择。
   - 文章详情页新增 `getSummaryForLang`/等价逻辑。
   - 中文显示与 TTS 使用 `ai_summary || summary_zh || summary`。
   - 预合成文章音频时也传入同样文本。

5. 修正 TTS 后端优先级。
   - `synthesizePendingAudio` 和 `/api/broadcast/article/[id]` 统一使用 `ai_summary || summary_zh || summary`。

6. 修正播报生成。
   - 读取 digest 的 `title/headlines/category_summaries/full_content`。
   - LLM prompt 强制中文。
   - 若输出非中文或分段失败，使用 digest 数据构建中文兜底脚本。
   - 新增稳健分段函数，保证 segment text 是真实段落文本。
   - `BroadcastPlayer` 接收 `voiceId`，on-demand TTS 使用保存的 voice。

## 文件改动计划

- `app/src/lib/rss/engine.ts`
- `app/src/lib/services/tts.ts`
- `app/src/app/api/feeds/fetch/route.ts`
- `app/src/app/api/broadcast/generate/route.ts`
- `app/src/components/ui/BroadcastPlayer.tsx`
- `app/src/app/broadcast/[id]/page.tsx`
- `app/src/app/article/[id]/page.tsx`
- `app/src/app/api/broadcast/article/[id]/route.ts`
- `开发日志.md`
- `docs/pola/test-reports/...`

## 测试策略

- `npx tsc --noEmit`
- 最小 API 检查：
  - `/api/articles?page=1&limit=1`
  - `/api/broadcast/{id}`
  - `/api/feeds/fetch` 代码路径审查，生产谨慎触发
- 浏览器回归：
  - 首页
  - 文章详情
  - 指定播报详情

## 部署与回滚

- 部署：git push 后服务器 `/opt/polanews` fast-forward，`npm ci` 如 lock 未变可跳过，`npm run build`，restart supervisor。
- 数据修复：对指定坏播报重新生成中文脚本和 segments/audio。
- 回滚：git reset 到上一提交并 rebuild/restart；坏播报可从部署前备份或重新生成。

