# PolaNews 文章摘要朗读连续播放修复架构

## 当前问题

`app/src/app/article/[id]/page.tsx` 之前把播放中的 `HTMLAudioElement` 放在 React state 中，但卸载清理闭包捕获的是旧值；文章切换时只重置了 UI 和预加载状态，没有统一停止播放对象。`audio.onended` 也只复位按钮状态，不会自动切换下一篇。

## 方案

1. 增加播放单例控制：
   - `audioRef` 保存当前真实 `HTMLAudioElement`
   - `speakingArticleIdRef` 标识当前播放所属文章
   - `autoAdvanceTimerRef` 管理播完后自动跳转
   - `nextArticleRef` 让 `onended` 使用最新下一篇信息

2. 新增统一方法：
   - `stopTTS()`：停止当前 audio、清理 src、取消 `speechSynthesis`、复位 UI 状态、取消自动跳转 timer
   - `navigateToArticle(articleId)`：先 `stopTTS()`，再 `router.push`
   - `handleTTSEnded(articleId)`：只处理当前文章的自然结束，若有下一篇则自动跳转

3. 改造所有文章导航入口：
   - 顶部上一篇/下一篇
   - 底部上一篇/下一篇
   - 相关文章
   - 键盘左右键
   - 移动端滑动
   - 返回首页/浏览器返回前主动停止

4. 改造朗读入口：
   - 如果正在播放，点击按钮只停止，不自动跳转
   - 如果准备开始播放，先 `stopTTS()`，再创建新音频，杜绝重叠
   - `HTMLAudioElement` 和 `SpeechSynthesisUtterance` 的自然结束都进入 `handleTTSEnded`

## 测试策略

- `npx tsc --noEmit`
- `npx eslint src/app/article/[id]/page.tsx`
- `npm run build`
- 线上浏览器回归：文章详情播放、下一篇导航、播完自动切换

