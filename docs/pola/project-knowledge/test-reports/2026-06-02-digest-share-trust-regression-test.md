# 测试报告：Digest 与分享海报可信度回归

日期：2026-06-02

## 验证命令

```bash
npm run harness:digest
npm run build
npm run lint
Playwright: GET http://localhost:3006/polanews/api/digests/latest?lang=zh&date=2026-05-15
Playwright: screenshot http://localhost:3006/polanews/digest
```

## 结果

- `npm run harness:digest`：通过，输出 `local=pass`、`storyCount=8`。
- `npm run build`：通过；Next route 列表包含 `/api/user/profile`。
- `npm run lint`：失败，30 problems，其中 11 errors、19 warnings；失败项为历史 React lint 债，主要在 `broadcast/page.tsx`、`category/[name]/page.tsx`、`digest/page.tsx`、`saved/page.tsx`、`search/page.tsx`、`starred/page.tsx`，本次新增文件未残留 unused import。
- Playwright：指定日期 API `200` 且 `Cache-Control: no-store`；Digest 列表页截图成功。

## 覆盖验收

| 验收 | 结果 |
| --- | --- |
| A1 Digest 噪音清洗 | harness 覆盖 `[Mock]`、`[general]`、公众号尾巴、Article/Comments URL |
| A2 分享海报不搬运 full_content | `buildDigestShareBrief` 优先 structured digest，fallback capped 8 lines；harness 覆盖 |
| A3 profile 不再 404 | 新增 `/api/user/profile`，build route 列表已包含 |
| A4 build + harness | 通过 |
| A5 no-store | `/api/digests/latest` 既有 date 分支保留 `Cache-Control: no-store`；harness remote 分支包含 header 断言 |

## 构建警告

Next build 有 3 个 Turbopack warning，均来自 `data/audio` 动态路径匹配过宽，非本次 Digest/share 变更引入。

## 浏览器证据

- `/Users/wangchang/Desktop/WSYCursorCode/PolaNews/.qa-artifacts/browser/polanews-digest-trust-regression-2026-06-02.png`
- `/Users/wangchang/Desktop/WSYCursorCode/PolaNews/.qa-artifacts/browser/polanews-digest-list-trust-regression-2026-06-02.png`

## 运行时观察

本地 `next start` 启动期间触发了既有 RSS/翻译后台任务，并出现一次上游 LLM 422 日志；该日志与本次 Digest/share route 变更无关，未影响 build、harness 和页面截图。
