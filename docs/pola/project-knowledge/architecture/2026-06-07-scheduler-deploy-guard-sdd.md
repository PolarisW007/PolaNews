# SDD：PolaNews Scheduler 与部署启动护栏

## 1. 当前系统理解

| 维度 | 事实 | 影响 |
| --- | --- | --- |
| Next.js | `next.config.ts` 使用 `output: 'standalone'`。 | 生产若用 `node .next/standalone/server.js`，必须先验证 standalone 文件存在。 |
| Scheduler | `src/lib/rss/scheduler.ts` 使用 `node-cron`。 | 需要在进程内防重入。 |
| 历史结构 | 仓库同时存在 root app 和 `app/` 子 app。 | 本次两处 scheduler 和 deploy doctor 保持一致。 |
| 生产问题 | supervisor 曾指向缺失的 standalone server.js。 | 需要部署前 doctor 阻止同类发布。 |
| 运行时音频 | `app/data/audio` 中存在大量 mp3，Turbopack 对动态路径匹配 10208 个文件。 | TTS 音频缓存必须从 `app` 构建根剥离，避免构建期扫描运行时文件。 |
| 根目录构建 | 根目录 `next build` 会误扫 `app/.next`、`app/.next/standalone` 与 `app/src/app`。 | 根目录 npm scripts 应委托到生产 `app/` 子项目，而不是继续构建旧 root Next 项目。 |

## 2. 架构选型

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| 仅改 supervisor 为 `next start` | 快速恢复 | 不能解决 scheduler 重入，也不沉淀检查 | 不选 |
| 新增部署 doctor + scheduler 进程内锁 | 改动小，不影响用户功能 | 进程内锁不能跨多实例 | 推荐 |
| 引入 BullMQ 全量任务队列 | 长期更稳 | 改动大，需 Redis/worker 发布 | 后续需求 |
| 保持 `app/data/audio` 并只配 tracing exclude | 兼容旧缓存 | Turbopack 仍会在源码动态路径处扫描并报警 | 不选 |
| 外置 TTS 音频运行时目录 | 构建根不再包含海量 mp3，URL/API 不变 | 旧缓存需要迁移或配置环境变量 | 推荐 |
| 根目录继续 `next build` | 无需改脚本 | 会持续误扫嵌套产物并触发旧导出错误 | 不选 |
| 根目录 scripts 委托 `app/` | 符合生产验证口径，避免误扫历史结构 | root 旧 Next 入口不再作为构建目标 | 推荐 |

## 3. 设计

### Scheduler

- `feedRunInProgress`：上一轮 feed/full ingest 未结束时跳过本轮。
- `digestRunInProgress`：上一轮 Digest 未结束时跳过本轮。
- `withTimeout()`：为任务链路设置最大等待时间。
- `POLANEWS_SCHEDULER_DISABLED=1`：禁用 scheduler，用于生产紧急止血。

### Deploy Doctor

- 命令：`npm run deploy:doctor`
- 检查：
  - 当前目录有 `next.config.ts` 或 `next.config.js`。
  - `.next/standalone/server.js` 存在。
  - `.next/static` 存在。
- 失败时给出明确处理建议：
  - 先 `npm run build`。
  - 若生产使用 `next start`，则 supervisor 不应指向 standalone server。

### TTS 音频缓存

- 默认目录：`resolve(process.cwd(), '..', '.polanews-runtime', 'audio')`，即从 `app` 目录运行时写到仓库级 `.polanews-runtime/audio`。
- 覆盖配置：`POLANEWS_AUDIO_DIR=/path/to/persistent/audio`。
- API URL：保持 `/api/tts/audio/{filename}` 不变，避免前端和数据库字段迁移。
- 路由层：`api/tts/synthesize` 不再直接 `existsSync(join(process.cwd(), 'data', 'audio', fname))`，统一调用 `audioFileExists()`。
- 安全约束：音频文件名必须匹配 `^[\w-]+\.mp3$`。
- 发布约束：旧 `app/data/audio` 文件需迁移到新目录，或生产设置 `POLANEWS_AUDIO_DIR` 指向旧持久化目录；不要在 build 时把该环境变量指回 `app/data/audio`。
- 迁移工具：`npm run migrate:audio` 默认 dry-run；`npm run migrate:audio -- --apply` 才会复制缺失 mp3，且不删除旧文件。

### 根目录命令委托

- 根目录 `package.json` 保留为仓库入口，但 `build/dev/start/lint/deploy:doctor` 均通过 `npm --prefix app run ...` 委托到 `app/`。
- 这样根目录执行 `npm run build` 与 `cd app && npm run build` 结果一致，避免 Turbopack 将 `app/.next` 历史产物作为根项目源码处理。

## 4. 文件改动

| 文件 | 内容 |
| --- | --- |
| `src/lib/rss/scheduler.ts` | root scheduler 防重入、超时、禁用开关 |
| `app/src/lib/rss/scheduler.ts` | app scheduler 防重入、超时、禁用开关 |
| `scripts/polanews_deploy_doctor.mjs` | root deploy doctor |
| `app/scripts/polanews_deploy_doctor.mjs` | app deploy doctor |
| `package.json` | root `deploy:doctor` |
| `app/package.json` | app `deploy:doctor` |
| `package.json` | root npm scripts 委托到 `app/` 子项目 |
| `app/src/lib/services/tts.ts` | 音频缓存默认外置、文件名校验、统一读取/存在性检查 |
| `app/src/app/api/tts/synthesize/route.ts` | 改用 TTS service 检查缓存文件 |
| `app/next.config.ts` | 补充 tracing exclude，防止旧目录被 standalone trace 收入 |
| `.gitignore` | 忽略 `.polanews-runtime/` |
| `app/scripts/migrate-audio-runtime.mjs` | 音频缓存 dry-run/apply 迁移工具 |

## 5. 测试策略

- `npm run build`
- `npm run deploy:doctor`
- `npm run harness:digest`
- 构建日志确认不再出现 `data/audio` Turbopack warning。
- 根目录 `npm run build`
- `git diff --check`

## 6. 部署与回滚

部署：

1. 发布前备份生产 supervisor 配置。
2. `npm ci` 如 lock 未变可跳过。
3. `npm run build`。
4. `npm run deploy:doctor`。
5. 迁移旧音频缓存：先 `npm run migrate:audio` 预览，再 `npm run migrate:audio -- --apply` 复制；如果生产使用外部持久化目录，设置 `POLANEWS_AUDIO_DIR`。
6. 若 doctor 通过，再 restart supervisor。
7. 发布后检查 `supervisorctl status polanews`、首页、核心 API 和一条已缓存 TTS 音频 URL。

回滚：

- git 回退到上一 commit。
- 重新 build。
- 恢复 supervisor 配置备份。
- restart supervisor。
