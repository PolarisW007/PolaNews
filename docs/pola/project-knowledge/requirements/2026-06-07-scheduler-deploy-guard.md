# PolaNews Scheduler 与部署启动护栏需求记录

## 原始需求

来自 2026-06-07 服务器 Critical I/O 诊断后的 P0 稳定性升级计划：PolaNews 线上 supervisor 进入 FATAL，错误为缺少 `.next/standalone/server.js`；同时 RSS scheduler 存在后台翻译/分类放飞、缺少防重入的问题。后续构建验证又发现 `app` 生产构建期间 Turbopack 会因 TTS 音频动态路径扫描 `data/audio` 下 10208 个文件，属于同类 I/O/构建压力风险。要求优化性能和安全，且不能影响现有功能使用。

## 需求口径

- 目标：让 PolaNews 定时任务不会重入堆积，在部署前发现 standalone 启动文件缺失，阻止构建器扫描运行时音频缓存，并让根目录构建命令委托到生产 `app/` 子项目，避免再次出现 supervisor 快速失败、后台任务 I/O/LLM 压力叠加、构建期海量文件追踪或根目录误扫嵌套产物。
- 用户：PolaNews 维护者、Pola 应用用户。
- 输入：Next.js build 产物、scheduler tick、bootstrap run、RSS/Digest 数据。
- 输出：防重入 scheduler、部署 doctor、项目 devlog 和验证证据。
- 非目标：不改 Digest 页面 UI、不改变文章列表/详情/播报/分享用户入口、不自动修改服务器 supervisor 配置、不轮换生产 secret。
- 假设：当前仓库存在 root app 和 `app/` 子 app 两套历史结构，生产路径可能使用 `/opt/polanews/app`；本次对两套 scheduler 和 doctor 保持一致，避免部署路径差异造成遗漏。

## 验收标准

- A1 文档：补齐需求、PRD、SDD、测试报告和 devlog。
- A2 Scheduler：RSS/全文 ingest 和 Digest 定时任务有运行锁，上一轮未结束时跳过本轮。
- A3 超时：Feed pipeline 和 Digest 有可配置超时，避免无限挂起。
- A4 禁用开关：支持 `POLANEWS_SCHEDULER_DISABLED=1` 禁用 scheduler，便于生产紧急止血。
- A5 部署检查：提供 `npm run deploy:doctor`，构建后检查 `.next/standalone/server.js` 和 `.next/static`。
- A6 音频缓存：TTS 运行时音频默认写入项目构建根外的 `.polanews-runtime/audio`，支持 `POLANEWS_AUDIO_DIR` 显式配置生产持久化目录，构建不再出现 `data/audio` 10208 文件扫描 warning。
- A7 根目录命令：根目录 `npm run build` 不再运行旧 root Next build，而是委托到生产 `app/` 子项目，避免扫描 `app/.next` 和 `app/.next/standalone`。
- A8 不影响功能：不改用户页面、API 路由和数据库 schema；现有 `npm run build`、digest harness 至少保持可运行。
- A9 脏文件保护：不触碰既有未提交 `src/app/digest/[date]/page.tsx`。

## 风险

- R1 如果生产实际使用 `next start` 而非 standalone，doctor 会提示配置错配，需要同步 supervisor 口径。
- R2 超时只能拒绝继续等待，无法主动中断底层 RSS/LLM 请求；后续可继续在 engine/client 层加 AbortSignal。
- R3 当前存在 root 与 `app/` 双结构，后续应单独做目录收敛，不在本次混做。
- R4 旧缓存文件若仍留在 `app/data/audio`，默认新运行时目录不会自动读取；生产发布时需迁移音频缓存到 `.polanews-runtime/audio`，或设置 `POLANEWS_AUDIO_DIR` 指向已有持久化目录。
