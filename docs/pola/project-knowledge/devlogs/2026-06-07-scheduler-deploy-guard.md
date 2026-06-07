# Devlog: PolaNews Scheduler and Deploy Guard - 2026-06-07

## Goal

落实服务器性能与安全升级计划中的 P0 PolaNews 项：修复生产 standalone 启动错配的可检测性，为 RSS/Digest scheduler 增加防重入和超时护栏，修复 Turbopack 构建扫描 `data/audio` 10208 个运行时音频文件的问题，并让根目录构建命令委托到生产 `app/` 子项目，避免后台任务和构建期 I/O 压力叠加。

## Changes

- `src/lib/rss/scheduler.ts`
  - Feed pipeline 增加运行锁和超时。
  - 翻译/分类从 fire-and-forget 改为同一 pipeline 中 await。
  - 增加 `POLANEWS_SCHEDULER_DISABLED=1` 禁用开关。
- `app/src/lib/rss/scheduler.ts`
  - Full ingest cron 和 bootstrap run 共用运行锁。
  - Digest run 增加运行锁和超时。
  - 增加禁用开关。
- `scripts/polanews_deploy_doctor.mjs`、`app/scripts/polanews_deploy_doctor.mjs`
  - 构建后检查 `.next/standalone/server.js` 与 `.next/static`。
- `package.json`、`app/package.json`
  - 新增 `deploy:doctor`。
- `package.json`
  - 根目录 `build/dev/start/lint/deploy:doctor` 改为委托到 `app/`，避免 root `next build` 误扫嵌套 `app/.next`。
- `app/src/lib/services/tts.ts`
  - TTS 音频默认目录从 `app/data/audio` 改为仓库级 `.polanews-runtime/audio`。
  - 支持 `POLANEWS_AUDIO_DIR` 指向生产持久化目录。
  - 新增文件名校验和 `audioFileExists()`，集中管理音频文件路径。
- `app/src/app/api/tts/synthesize/route.ts`
  - 移除路由层对 `data/audio` 的动态路径拼接，改用 TTS service 检查缓存文件。
- `app/next.config.ts`
  - 增加 `data/audio` tracing exclude，避免旧目录被 standalone trace 收入。
- `app/scripts/migrate-audio-runtime.mjs`、`app/package.json`
  - 新增 `npm run migrate:audio`，默认 dry-run，`-- --apply` 才复制旧音频缓存到运行时目录。
- `.gitignore`
  - 忽略 `.polanews-runtime/` 运行时缓存目录。
- `docs/pola/arch-reference.md`
  - 记录 PolaNews 架构约束：运行时文件不要默认写入 Next 构建根。

## User Impact

- 用户页面、API、数据库 schema 不变。
- 音频 API URL 不变，仍为 `/api/tts/audio/{filename}`；只改变服务器默认磁盘缓存位置。
- 如果上一轮定时任务仍在运行，新一轮会被跳过并记录 warn，避免任务堆积。
- 生产紧急情况可禁用 scheduler，但需要显式设置环境变量。

## Verification

- PASS: `cd app && npm run build`，且不再出现 `data/audio` 10208 文件 Turbopack warning。
- PASS: `npm run build`，根目录构建已委托到 `app/` 并通过。
- PASS: `cd app && npm run deploy:doctor`
- PASS: `cd app && npm run harness:digest`
- PASS: `cd app && npm run migrate:audio` dry-run。
- PASS: `pola-agent-delivery-framework/scripts/validate_pola_skills.py`
- PASS: `git diff --check`

## Production Audio Migration

- Server: `pola-server`
- Old audio dir: `/opt/polanews/app/data/audio`
- New default audio dir: `/opt/polanews/.polanews-runtime/audio`
- Read-only precheck on 2026-06-07: old mp3 count `0`, new mp3 count `0`; no files needed copying.
- Service precheck: `supervisorctl status polanews` returned `FATAL`, so deployment/restart verification is required after code sync.

## Notes

- 本轮未触碰既有脏文件 `src/app/digest/[date]/page.tsx`。
- 不包含生产 supervisor 配置变更；生产发布需要单独确认窗口和回滚。
- 旧 `app/data/audio` 缓存可用 `npm run migrate:audio -- --apply` 迁移到 `.polanews-runtime/audio`；当前线上预检查为 0 个 mp3，无需复制。
- 根目录旧 Next 构建仍不是生产目标；现已通过脚本委托避免误触该历史结构。
