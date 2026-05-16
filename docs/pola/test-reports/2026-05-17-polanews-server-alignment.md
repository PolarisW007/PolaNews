# PolaNews Server Alignment Test Report

## Summary

Production was migrated from the old `WSYWorldOverview/worldoverview` naming to `polanews` and deployed from git commit `644f89e`.

Follow-up regression on 2026-05-17 01:00 CST found the production page was failing to hydrate because nginx served `/_next/static/*` from the standalone directory. The app was built in place on the server, so the real static assets live in `/opt/polanews/app/.next/static/`. Updating the nginx aliases restored JS/CSS loading.

## Environment Evidence

- Local conda env: `pola-news`
- Local env Node: `v22.22.2`
- Server Node: `v22.22.1`
- Server npm: `10.9.4`
- Server app root: `/opt/polanews`
- Server service: `supervisor` program `polanews`
- Server reverse proxy: `nginx`, `/polanews` -> `http://localhost:3456`
- Database: PostgreSQL 16 on `127.0.0.1:5432/worldoverview`
- Cache/queue: Redis 7 on `localhost:6379`

## Commands And Results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` locally | Pass |
| Server `npm ci` | Pass |
| Server `npm run build` | Pass |
| `nginx -t` | Pass |
| `supervisorctl status polanews` | `RUNNING` |
| `curl -I http://127.0.0.1:3456/polanews` | `HTTP/1.1 200 OK` |
| `curl -I http://aipd.me/polanews` | `HTTP/1.1 200 OK` |
| `curl http://aipd.me/polanews/api/articles` | JSON success with article data |
| Server source markers | Latest feature markers present |
| `curl -I http://aipd.me/polanews/_next/static/chunks/0910b3c6896b5ba3.js` | `HTTP/1.1 200 OK` |
| Browser home page hydration | Pass, 20 article cards visible and translated |
| Browser infinite scroll | Pass, article cards increased from 20 to 40 |
| Browser digest poster page | Pass, `Digest 图片海报` and `下载 PNG` visible |
| Browser share detail poster | Pass, share detail exposes image/download area |

## Feature Marker Evidence

Verified on `/opt/polanews`:

- `html-to-image` exists in `app/package.json`
- `IntersectionObserver` exists in `app/src/app/page.tsx`
- `HTML 海报预览` exists in `app/src/app/share/page.tsx`
- `Digest 图片海报` exists in `app/src/app/digest/[date]/page.tsx`
- `UNTRANSLATED_WHERE` exists in `app/src/app/api/articles/translate/route.ts`
- `NO_STORE_HEADERS` exists in `app/src/app/api/articles/route.ts`

## Browser Verification Notes

The in-app browser reached `http://aipd.me/polanews`, `http://aipd.me/polanews/digest/2026-05-15`, and `http://aipd.me/polanews/share` without console errors.

Evidence after the nginx alias fix:

- Home page rendered 20 hydrated article cards, including translated Chinese title `一款真正让我挺直腰背的离线桌面小工具`.
- Infinite scroll loaded the next page and increased article links from 20 to 40.
- Digest detail rendered `Digest 图片海报` and `下载 PNG`.
- Share history opened; selecting a share item exposed the detailed Chinese share content and image/download area.

## Static Asset Regression

- Symptom: production HTML returned 200, APIs returned success, but the page appeared broken because client JS/CSS chunks were 404.
- Root cause: nginx alias for `/polanews/_next/static/` pointed to `/opt/polanews/app/.next/standalone/.next/static/`, while the direct server build outputs assets to `/opt/polanews/app/.next/static/`.
- Fix applied on server: both `/etc/nginx/conf.d/polazj.conf` and `/etc/nginx/sites-enabled/aicoacher` now alias `/polanews/_next/static/` to `/opt/polanews/app/.next/static/`; `nginx -t` passed and nginx was reloaded.
- Post-fix log check: no new `/polanews/_next/static` nginx errors after 2026-05-17 01:00 CST.

## Local Quality Gate

- `npx tsc --noEmit`: Pass.
- `npm run lint`: Fail on existing lint debt outside the static asset fix path, including unescaped quotes in `broadcast/page.tsx` and `digest/page.tsx`, React hook rule violations in category/search/saved/starred/header pages, and `prefer-const` in `src/lib/ai/llm.ts`.

## Backup And Rollback

- Deployment backup directory: `/opt/backups/polanews-20260517001731`
- Old app directory preserved: `/opt/WSYWorldOverview`
- Rollback path: restore backed-up nginx/supervisor configs, restart old `worldoverview`, and reload nginx.

## Residual Risks

- npm audit reports existing dependency vulnerabilities. They were not auto-fixed during production deployment to avoid unplanned breaking upgrades.
- Old `/opt/WSYWorldOverview` remains on disk as rollback material and can be removed after a stable observation window.
- The nginx static alias is an infrastructure config fix, not a repository code change. Future deployment automation should preserve `/opt/polanews/app/.next/static/` for direct server builds or explicitly copy `.next/static` into `.next/standalone/.next/static/`.
