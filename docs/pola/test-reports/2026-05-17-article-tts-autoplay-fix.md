# PolaNews 文章摘要朗读连续播放修复测试报告

## 初步结论

本地质量门禁通过。部署后继续补充线上浏览器回归证据。

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

## 待补充

- 部署后浏览器验证播放中切下一篇、下一篇再次朗读、自然结束自动跳下一篇。

