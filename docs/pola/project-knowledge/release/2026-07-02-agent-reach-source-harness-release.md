# Release Manifest: Agent Reach Source Harness for PolaNews

Date: 2026-07-02
Status: ready for GitHub push; server deployment blocked by current server timeout

## Scope

- Add source reach doctor core module and `GET /api/source-reach/doctor`.
- Add CLI command `polanews source-reach doctor` and MCP tool `source_reach_doctor`.
- Add safe Jina Reader fallback after local Readability returns no useful article.
- Keep RSS ingest, article listing, digest pages, saved/starred/search routes, TTS URLs, login state and existing data unchanged.
- No DB schema change, no scheduler change, no production config change.

## Risk

- Risk level: P2, because production deployment requires Next.js rebuild and supervisor restart.
- Doctor output is side-effect-free and returns config presence booleans only.
- Jina fallback is bounded by timeout and only used for public HTTP(S) article URLs after the existing local extraction path fails.

## Version Targets

- Local branch: `main`.
- Remote: `origin/main` (`git@github.com:PolarisW007/PolaNews.git`).
- Production path: `/opt/polanews`.
- Production service: supervisor `polanews`.
- Production URL: `https://aipd.me/polanews`.

## Pre-Release Evidence

- Function test case harness: pass, 7 cases.
- `npm run build`: pass in the implementation pass; route table included `/api/source-reach/doctor`.
- `npx tsx` offline doctor probe: `{"project":"PolaNews","live":false,"total":7,"ok":6,"off":1,"side_effect_free":true}`.
- `npm run deploy:doctor`: pass.
- Task-owned eslint: pass with 0 errors and 2 pre-existing warnings in `app/src/lib/mcp/server.ts`.
- Full `npm run lint`: blocked by pre-existing page issues outside this task.
- `git diff --check`: pass.
- Secret scan: false positives only for existing CLI option names such as `token`.

## Deployment Plan

Run only after `pola-server` responds:

```bash
cd /opt/polanews
git status --short
git pull --ff-only origin main
npm run build
npm run deploy:doctor
supervisorctl restart polanews
supervisorctl status polanews
curl -fsS http://127.0.0.1:3456/polanews/api/source-reach/doctor?live=false
curl -I https://aipd.me/polanews
```

Do not change supervisor or nginx config in this release.

## Rollback

```bash
cd /opt/polanews
git log --oneline -5
git reset --hard <previous-good-commit>
npm run build
npm run deploy:doctor
supervisorctl restart polanews
supervisorctl status polanews
```

Rollback removes the source-reach module/route and the small CLI/MCP/readability additions.

## Current Blocker

Initial server checks on 2026-07-02 timed out:

- `ssh pola-server`: timed out during banner exchange.
- `curl https://aipd.me/polanews`: timed out.

This looks like server or network unavailability, not a code/test blocker.
