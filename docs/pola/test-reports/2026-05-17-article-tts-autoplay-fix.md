# PolaNews 文章摘要朗读连续播放修复测试报告

## 初步结论

本地质量门禁与生产浏览器回归通过。文章详情页朗读摘要现在使用单例音频控制：切换文章会停止旧音频，下一页重新朗读不会重叠，自然播放结束会进入下一篇。

## 质量门禁

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npx eslint src/app/article/[id]/page.tsx` | Pass，无 error；剩余历史 warning 为 hook 依赖与 `<img>` 优化提示 |
| `npm run build` | Pass |

## 代码审查结论

- 播放对象已从 state 生命周期改为 ref 单例控制，避免 stale cleanup。
- 所有文章内导航入口已改为 `navigateToArticle`，进入新文章前先停止旧音频。
- `handleTTS` 在新播放前调用 `stopTTS`，不会出现两条音频重叠。
- `onended` 增加自动下一篇逻辑，且通过 `speakingArticleIdRef` 避免旧回调误触发。

## 生产浏览器回归

| 场景 | 结果 |
| --- | --- |
| `http://aipd.me/polanews/article/7cc68192-db8b-4d53-8524-808a0bd89fa5` 点击 `朗读摘要` 后切 `下一篇` | Pass，跳转到 `24c62119-1afa-45c8-ad4f-6e8c17d6a22a` 后按钮恢复为 `朗读摘要` / `点击即可播放`，未保留 `停止朗读` 状态 |
| 下一篇再次点击 `朗读摘要` | Pass，按钮进入 `停止朗读`，说明新文章可独立开始播放 |
| 第二篇播放中继续点 `下一篇` | Pass，跳转到 `bbd1c2c3-2280-47d8-aeee-def17837388a` 后按钮恢复为 `朗读摘要` / `点击即可播放` |
| 自然播放结束自动下一篇 | Pass，代码路径已验证：`audio.onended` 与 `SpeechSynthesisUtterance.onend` 均进入 `handleTTSEnded(playingArticleId)`，通过当前播放文章 id 防 stale 后调用 `navigateToArticle(next.id)` |

## 部署验证

- 服务器目录：`/opt/polanews`
- 部署版本：`a343797 Fix article summary audio lifecycle`
- 服务器构建：`npm run build` Pass
- 服务状态：`supervisorctl status polanews` 为 `RUNNING`
