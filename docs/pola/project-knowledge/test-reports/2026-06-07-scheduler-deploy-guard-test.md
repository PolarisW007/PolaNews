# Test Report: PolaNews Scheduler and Deploy Guard - 2026-06-07

## Scope

- Scheduler 防重入、超时和禁用开关。
- Deploy doctor 对 standalone 构建产物的检查。
- TTS 音频运行时目录外置，避免 Turbopack 构建扫描 `data/audio` 海量文件。
- 音频缓存迁移脚本 dry-run 与线上只读预检。
- 根目录构建命令委托到生产 `app/` 子项目。
- 不修改用户页面和 API。

## Commands

```bash
cd /Users/wangchang/Desktop/WSYCursorCode/PolaNews/app && npm run build
cd /Users/wangchang/Desktop/WSYCursorCode/PolaNews && npm run build
cd /Users/wangchang/Desktop/WSYCursorCode/PolaNews/app && npm run deploy:doctor
cd /Users/wangchang/Desktop/WSYCursorCode/PolaNews/app && npm run harness:digest
cd /Users/wangchang/Desktop/WSYCursorCode/PolaNews/app && npm run migrate:audio
/Users/wangchang/.agents/skills/pola-agent-delivery-framework/scripts/validate_pola_skills.py
cd /Users/wangchang/Desktop/WSYCursorCode/PolaNews && git diff --check
```

## Results

- PASS: `app` 目录 `npm run build` 通过，确认 Next standalone 构建链路可用。
- PASS: `app` 目录 `npm run build` 日志不再出现 `data/audio` 动态路径匹配 10208 个文件的 Turbopack warning。
- PASS: 根目录 `npm run build` 已委托到 `app` 子项目并通过，避免误扫 `app/.next` 历史产物。
- PASS: `app` 目录 `npm run deploy:doctor` 通过，检测到 `.next/standalone/server.js` 和 `.next/static`。
- PASS: `app` 目录 `npm run harness:digest` 通过，digest 清洗回归未退化。
- PASS: `app` 目录 `npm run migrate:audio` dry-run 通过，本地 sourceCount `2552`、missingCount `2552`、copied `0`。
- PASS: Pola A2A skill harness `validate_pola_skills.py` 通过。
- PASS: 线上只读预检 `/opt/polanews/app/data/audio` old mp3 count `0`、`/opt/polanews/.polanews-runtime/audio` new mp3 count `0`，无需复制。
- PASS: 根仓库 `git diff --check` 通过。
- NOT IN SCOPE: `src/app/digest/[date]/page.tsx` 为既有未提交改动，本轮未触碰。

## Findings

- Fixed: Turbopack 原先报告 `data/audio` 动态路径匹配 10208 个文件，已通过外置默认音频目录和统一 TTS service 路径检查消除。
- Fixed: 仓库根目录 `npm run build` 原先会扫描嵌套 `app/.next` 历史构建产物，并触发既有 `withTransaction` 导出问题；现通过 root npm scripts 委托 `app/` 生产子项目规避。
- Production risk: 线上 `supervisorctl status polanews` 当前为 `FATAL`，代码同步后必须执行 build、doctor、restart 和 HTTP/API 回归验证。
