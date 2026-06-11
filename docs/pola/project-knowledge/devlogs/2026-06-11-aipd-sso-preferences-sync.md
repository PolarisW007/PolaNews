# Devlog: AIPD SSO and Preferences Sync - 2026-06-11

## Goal

把服务器 `/opt/polanews` 上的 AIPD 统一账号热修正式带回本地仓库，并工程化为可配置、可验证的实现，保持本地、GitHub、服务器代码同步。

## Changes

- `app/src/lib/aipd-sso.ts`
  - 新增 AIPD SSO 与统一偏好 helper。
  - 支持 `AIPD_INTERNAL_BASE_URL`、`AIPD_APP_ID`、`AIPD_PERMISSION` 覆盖默认配置。
- `app/src/app/api/auth/sso/aipd/route.ts`
  - 新增 AIPD cookie 到 PolaNews JWT 的桥接 route。
  - 按 email 创建或更新本地用户资料。
- `app/src/components/layout/Header.tsx`
  - 未登录时静默尝试 AIPD SSO，成功后写入 `auth_token` / `user` 并刷新 Header。
- `app/src/app/api/settings/route.ts`
  - Settings GET 优先读取 AIPD 统一偏好中的主题、字体、缩放、密度。
  - Settings PUT 将主题、字体、缩放、密度同步到 AIPD，本地继续保存语言、Digest 时间、分类等 PolaNews 偏好。
- `app/src/lib/types.ts`、`app/src/app/settings/page.tsx`
  - 补充 `font_family/font_scale/density` 类型字段。
- `docs/pola/project-knowledge/*`
  - 新增需求、PRD、SDD、测试报告和开发日志。

## Verification

- PASS: `cd app && npx tsc --noEmit`
- PASS: `cd app && npx eslint src/lib/aipd-sso.ts src/app/api/auth/sso/aipd/route.ts src/app/api/settings/route.ts src/components/layout/Header.tsx src/app/settings/page.tsx src/lib/types.ts`
- PASS: `cd app && npm run harness:feeds`
- PASS: `cd app && npm run harness:digest`
- PASS: `cd app && npm run deploy:doctor`
- PASS: `cd app && npm run build`
- PASS: `git diff --check`
- PASS: Local smoke `POST http://localhost:3011/polanews/api/auth/sso/aipd` without AIPD cookie returns controlled `401`; `HEAD /polanews` returns `200`.
- PASS: GitHub push to `main` at `a0720b8`.
- PASS: Server `/opt/polanews` fast-forwarded to `a0720b8`, `npm run build` and `npm run deploy:doctor` passed.
- PASS: `supervisorctl restart polanews` returned RUNNING, `http://127.0.0.1:3456/polanews` and `http://aipd.me/polanews` returned `200 OK`.
- PASS: Server `POST /polanews/api/auth/sso/aipd` without AIPD cookie returned controlled `401`.
- PASS: Server `npm run harness:feeds` and `npm run harness:digest` passed.

## Notes

- 本轮继续保留旧根目录脏改动 `src/app/digest/[date]/page.tsx`，不纳入提交。
- 本轮发现工作区已有未跟踪 `2026-06-11-minimax-m3-upgrade-*` 文档和 `app/scripts/backfill-digest-structured.mjs` 模型名改动；它们不属于本次 AIPD SSO 同步范围，未纳入本次提交。
- 服务器上的原热修和 `app/.env.local.bak-20260524003405` 已保存到 `stash@{0}: pre-aipd-sso-sync-20260611143721`，不纳入仓库。
