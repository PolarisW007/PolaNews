# 测试报告：AIPD SSO 与统一偏好同步

## 计划

- 本地 TypeScript 检查。
- 本地相关 ESLint 检查。
- PolaNews 既有 harness 回归。
- 生产部署后 smoke。

## 结果

| 检查项 | 结果 |
| --- | --- |
| `cd app && npx tsc --noEmit` | PASS |
| `cd app && npx eslint src/lib/aipd-sso.ts src/app/api/auth/sso/aipd/route.ts src/app/api/settings/route.ts src/components/layout/Header.tsx src/app/settings/page.tsx src/lib/types.ts` | PASS |
| `cd app && npm run harness:feeds` | PASS，`presetFeedCount=53`、`expectedFeedCount=12` |
| `cd app && npm run harness:digest` | PASS，清洗后文本不含 Mock/公众号尾巴 |
| `cd app && npm run deploy:doctor` | PASS，检测到 `.next/standalone/server.js` 和 `.next/static` |
| `cd app && npm run build` | PASS，新 route `/api/auth/sso/aipd` 出现在 build route list |
| `git diff --check` | PASS |

## 本地 Smoke

临时启动：

```bash
cd app && PORT=3011 npm run start
```

结果：

- `POST http://localhost:3011/polanews/api/auth/sso/aipd` 在无 AIPD cookie 时返回 `401 Unauthorized` 和 `{"success":false,"error":"织梦空间登录态无效"}`。
- `HEAD http://localhost:3011/polanews` 返回 `HTTP/1.1 200 OK`。
- smoke 后已停止本地 `3011` 服务。

## 注意

- `npm run start` 会启动 scheduler；本次仅短时间 smoke 后关闭。后续长时间本地验证建议设置 `POLANEWS_SCHEDULER_DISABLED=1`。
- 全量 `npm run lint` 仍可能被历史页面规则拦截，本次使用相关文件 lint 作为门禁。

## 生产验证

部署版本：

- GitHub / local / server commit: `a0720b8 feat: sync AIPD SSO preferences`
- 服务器目录：`/opt/polanews`
- 服务器原未提交热修已保存为 stash：`stash@{0}: pre-aipd-sso-sync-20260611143721`

命令与结果：

| 检查项 | 结果 |
| --- | --- |
| `cd /opt/polanews && npm run build` | PASS |
| `cd /opt/polanews && npm run deploy:doctor` | PASS |
| `supervisorctl restart polanews && supervisorctl status polanews` | PASS，`RUNNING pid 2362909` |
| `HEAD http://127.0.0.1:3456/polanews` | PASS，`HTTP/1.1 200 OK` |
| `HEAD http://aipd.me/polanews` | PASS，`HTTP/1.1 200 OK` |
| `GET http://127.0.0.1:3456/polanews/api/articles?limit=1` | PASS，返回 JSON success |
| `POST http://127.0.0.1:3456/polanews/api/auth/sso/aipd` 无 cookie | PASS，返回 `401 Unauthorized` 和 `织梦空间登录态无效` |
| `cd /opt/polanews/app && npm run harness:feeds && npm run harness:digest` | PASS |
| `cd /opt/polanews && git status --short --branch` | PASS，`main...origin/main` 无工作区改动 |
