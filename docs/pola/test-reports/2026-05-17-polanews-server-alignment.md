# PolaNews Server Alignment Test Report

## Summary

Production was migrated from the old `WSYWorldOverview/worldoverview` naming to `polanews` and deployed from git commit `d28411c`.

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

## Feature Marker Evidence

Verified on `/opt/polanews`:

- `html-to-image` exists in `app/package.json`
- `IntersectionObserver` exists in `app/src/app/page.tsx`
- `HTML 海报预览` exists in `app/src/app/share/page.tsx`
- `Digest 图片海报` exists in `app/src/app/digest/[date]/page.tsx`
- `UNTRANSLATED_WHERE` exists in `app/src/app/api/articles/translate/route.ts`
- `NO_STORE_HEADERS` exists in `app/src/app/api/articles/route.ts`

## Browser Verification Notes

The in-app browser reached `http://aipd.me/polanews`, `http://aipd.me/polanews/digest/2026-05-15`, and `http://aipd.me/polanews/share` without console errors. The browser automation snapshot did not reliably expose the hydrated article cards, so HTTP/API checks were used as the authoritative production health signal for article data.

## Backup And Rollback

- Deployment backup directory: `/opt/backups/polanews-20260517001731`
- Old app directory preserved: `/opt/WSYWorldOverview`
- Rollback path: restore backed-up nginx/supervisor configs, restart old `worldoverview`, and reload nginx.

## Residual Risks

- npm audit reports existing dependency vulnerabilities. They were not auto-fixed during production deployment to avoid unplanned breaking upgrades.
- Old `/opt/WSYWorldOverview` remains on disk as rollback material and can be removed after a stable observation window.
