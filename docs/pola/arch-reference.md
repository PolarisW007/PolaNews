# PolaNews Arch Reference

## 项目形态

PolaNews 是 Next.js 应用，当前仓库存在 root 与 `app/` 两套历史结构。生产验证以 `app/` 子项目为准，`app/next.config.ts` 使用 `output: 'standalone'` 与 `basePath: '/polanews'`。

## 前端与 API

- 页面入口位于 `app/src/app/`。
- API 路由位于 `app/src/app/api/`。
- 用户可见 TTS 音频 URL 保持 `/api/tts/audio/{filename}`，由 API route 读取服务器运行时文件。

## 后端与任务

- RSS scheduler 位于 `app/src/lib/rss/scheduler.ts`，使用 `node-cron`。
- TTS service 位于 `app/src/lib/services/tts.ts`，负责语音合成、音频文件路径、缓存读取和缓存存在性检查。
- 运行时文件不得默认写入 `app` 构建根。TTS 音频默认写入仓库级 `.polanews-runtime/audio`，可通过 `POLANEWS_AUDIO_DIR` 指向生产持久化目录。

## 构建与部署约束

- `app` 子项目生产构建命令：`npm run build`。
- 仓库根目录 `npm run build` 委托到 `app` 子项目，避免旧 root Next 结构误扫 `app/.next` 和 `app/src/app`。
- 构建后检查命令：`npm run deploy:doctor`。
- `data/audio` 这类运行时缓存目录不应进入 Turbopack/standalone tracing，否则会造成海量文件扫描和潜在 I/O 压力。
- 旧 `app/data/audio` 缓存如需保留，应在发布阶段迁移到 `.polanews-runtime/audio`，或仅在运行时设置 `POLANEWS_AUDIO_DIR` 指向稳定目录。

## 复用优先级

- TTS 文件路径、存在性检查、读取逻辑必须复用 `app/src/lib/services/tts.ts`，不要在路由层自行拼接运行时文件路径。
- 构建和部署检查优先复用 `app/scripts/polanews_deploy_doctor.mjs`。
