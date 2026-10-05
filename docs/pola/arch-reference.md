# PolaNews Arch Reference

## 项目形态

PolaNews 是 Next.js 应用，当前仓库存在 root 与 `app/` 两套历史结构。生产验证以 `app/` 子项目为准，`app/next.config.ts` 使用 `output: 'standalone'` 与 `basePath: '/polanews'`。

## 前端与 API

- 页面入口位于 `app/src/app/`。
- API 路由位于 `app/src/app/api/`。
- 用户可见 TTS 音频 URL 保持 `/api/tts/audio/{filename}`，由 API route 读取服务器运行时文件。

## 后端与任务

- RSS scheduler 位于 `app/src/lib/rss/scheduler.ts`，使用 `node-cron`。
- RSS 失败源不能永久退出调度；生产实现应记录下一次重试时间，采用有上限的指数退避，成功后恢复 `active`。
- TTS service 位于 `app/src/lib/services/tts.ts`，负责语音合成、音频文件路径、缓存读取和缓存存在性检查。
- 运行时文件不得写入 `.next` 构建树。生产 TTS 必须通过绝对路径 `POLANEWS_AUDIO_DIR` 指向持久化目录，不能依赖 standalone 的 `process.cwd()` 推导。
- 音频属于可再生成缓存：必须配置保留期、每日清理锁、dry-run/候选指纹与统计能力，并在删除前先清空相应数据库缓存指针，避免形成断链。
- AI 批处理必须隔离单条内容安全拒绝，不能让单条失败中断整批。
- 高成本维护任务只能通过 token 保护、批量有上限、可续跑的运维入口执行。

## 构建与部署约束

- `app` 子项目生产构建命令：`npm run build`。
- 仓库根目录 `npm run build` 委托到 `app` 子项目，避免旧 root Next 结构误扫 `app/.next` 和 `app/src/app`。
- 构建后检查命令：`npm run deploy:doctor`。
- `data/audio` 这类运行时缓存目录不应进入 Turbopack/standalone tracing，否则会造成海量文件扫描和潜在 I/O 压力。
- 旧 `app/data/audio` 缓存如需保留，应在发布阶段迁移到 `.polanews-runtime/audio`，或仅在运行时设置 `POLANEWS_AUDIO_DIR` 指向稳定目录。
- 生产部署前必须确认磁盘余量足以同时容纳当前构建和新构建；磁盘告急时先执行有 manifest 和数据库备份的受控缓存清理。

## 复用优先级

- TTS 文件路径、存在性检查、读取逻辑必须复用 `app/src/lib/services/tts.ts`，不要在路由层自行拼接运行时文件路径。
- 构建和部署检查优先复用 `app/scripts/polanews_deploy_doctor.mjs`。
