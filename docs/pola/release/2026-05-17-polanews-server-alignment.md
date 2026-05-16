# PolaNews Server Alignment Release Plan

## Project Context

- Local repository: `/Users/wangchang/Desktop/WSYCursorCode/PolaNews`
- Local branch: `main`
- Local target commit: `644f89e`
- Production URL: `http://aipd.me/polanews`
- Existing server app root: `/opt/WSYWorldOverview`
- Target server app root: `/opt/polanews`
- Runtime service manager: `supervisor`
- Reverse proxy: `nginx`

## Requirement

Align local and server environments, keep code synchronized through git, deploy the latest local `main` code to the server, and rename the production project paths/service naming from `WSYWorldOverview/worldoverview` to `polanews`.

## Acceptance Criteria

- Server source is cloned from GitHub into `/opt/polanews`.
- Server git HEAD equals local `main` HEAD.
- Server build is produced on Linux with Node 22.
- Existing production environment values, app data, and share images are preserved.
- supervisor program name is `polanews`.
- nginx `/polanews/_next/static/` aliases point to `/opt/polanews/app/.next/static/` for direct server builds.
- `http://127.0.0.1:3456/polanews` and `http://aipd.me/polanews` return HTTP 200.
- Latest feature markers exist on server: `html-to-image`, `Digest 图片海报`, `HTML 海报预览`, `UNTRANSLATED_WHERE`, and homepage `IntersectionObserver`.

## Deployment Plan

1. Create timestamped backups under `/opt/backups/polanews-*`.
2. Clone or refresh `/opt/polanews` from `https://github.com/PolarisW007/PolaNews.git`.
3. Copy preserved runtime state from `/opt/WSYWorldOverview`:
   - `app/.env.local`
   - `app/data`
   - `share-images`
4. Run `npm ci` and `npm run build` in `/opt/polanews/app`.
5. Replace supervisor config with `[program:polanews]`, directory `/opt/polanews/app`, port `3456`, `SHARE_IMAGES_DIR=/opt/polanews/share-images`.
6. Update nginx aliases from `/opt/WSYWorldOverview` to `/opt/polanews`.
   - For direct server builds, `/polanews/_next/static/` must alias `/opt/polanews/app/.next/static/`.
   - Only use `/opt/polanews/app/.next/standalone/.next/static/` if the deploy process explicitly copies static assets into the standalone directory.
7. Reload supervisor and nginx.
8. Verify health endpoints and browser-visible pages.

## Deployment Result

- Status: deployed
- Deployed server root: `/opt/polanews`
- Deployed service name: `polanews`
- Deployed commit: `644f89e`
- Backup directory: `/opt/backups/polanews-20260517001731`
- Old root preserved: `/opt/WSYWorldOverview`
- External health check: `http://aipd.me/polanews` returned `HTTP/1.1 200 OK`
- API health check: `http://aipd.me/polanews/api/articles` returned JSON success with article data

## Post-Deploy Regression Fix

- Issue observed on 2026-05-17: `http://aipd.me/polanews` returned HTML/API 200 but the page looked broken because `_next/static` JS/CSS chunks were 404.
- Root cause: nginx served static assets from `.next/standalone/.next/static/`; the production build on this server stores them in `.next/static/`.
- Remediation: changed nginx aliases in `/etc/nginx/conf.d/polazj.conf` and `/etc/nginx/sites-enabled/aicoacher` to `/opt/polanews/app/.next/static/`, then ran `nginx -t` and reloaded nginx.
- Validation: representative JS chunk returned `HTTP/1.1 200 OK`; browser regression showed home hydration, infinite scroll, digest poster, and share detail poster all functioning with no console errors.

## Rollback

- Restore old supervisor config from backup and reread/update supervisor.
- Restore old nginx config from backup and reload nginx.
- Restart old `worldoverview` program if needed.
- `/opt/WSYWorldOverview` is left in place until the new deployment is verified.
