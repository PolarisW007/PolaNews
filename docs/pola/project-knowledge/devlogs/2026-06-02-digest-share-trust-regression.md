# 开发日志：Digest 与分享海报可信度回归

日期：2026-06-02
需求池记录：`pglBTXPyFe`

## 目标

补齐 PolaNews Digest 内容可信度、分享海报 source brief 和 profile 兼容接口回归。

## 改动文件

- 修改：`app/src/lib/digest-clean.ts`
- 修改：`app/src/app/api/share/generate/route.ts`
- 新增：`app/src/app/api/user/profile/route.ts`
- 修改：`app/scripts/harness-digest-clean.mjs`
- 新增：`docs/pola/project-knowledge/requirements/2026-06-02-digest-share-trust-regression.md`
- 新增：`docs/pola/project-knowledge/specs/2026-06-02-digest-share-trust-regression-prd.md`
- 新增：`docs/pola/project-knowledge/architecture/2026-06-02-digest-share-trust-regression-sdd.md`
- 新增：`docs/pola/project-knowledge/test-reports/2026-06-02-digest-share-trust-regression-test.md`

## 实现

- 新增 `buildDigestShareBrief`，分享生成优先使用 structured digest 精选；fallback 只取清洗后的前 8 行。
- `/api/share/generate` 改用 brief，避免直接搬运完整 `full_content`。
- 新增 `/api/user/profile` 兼容接口，未登录返回 401，已登录返回用户设置摘要。
- harness 增加 share brief 断言，覆盖 structured 优先和 fallback 行数上限。

## 验证

```bash
npm run harness:digest
npm run build
npm run lint
Playwright 本地截图 `/polanews/digest` 与指定日期 API no-store 检查
```

## 结果

- `harness:digest` 通过。
- `build` 通过，路由列表包含 `/api/user/profile`。
- `lint` 仍失败于既有 React lint 债；本次新增 unused import 已修复。
- 指定日期 API `http://localhost:3006/polanews/api/digests/latest?lang=zh&date=2026-05-15` 返回 `200`，`Cache-Control: no-store`。
- 浏览器截图：`.qa-artifacts/browser/polanews-digest-list-trust-regression-2026-06-02.png`。

## 风险

- 根目录 `src/app/digest/[date]/page.tsx` 存在用户/历史脏改动，本次未纳入提交。
- 未做生产线上 no-store 实测；本地/代码路径保留 header，harness remote 分支可在有线上日期 URL 时验证。
- 本地服务启动时既有 RSS/翻译后台任务出现一次上游 LLM 422 日志，未影响本次验收链路。
