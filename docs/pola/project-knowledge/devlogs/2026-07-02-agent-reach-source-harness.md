# Devlog: Agent Reach Source Harness for PolaNews

Date: 2026-07-02
Mode: A2A implement plus user-requested GitHub push and server deployment.

## Goal

Implement Agent-Reach-inspired source capability harness for PolaNews, including documents, API, CLI, MCP, fulltext fallback and machine-readable delivery evidence.

## Planned Changes

- Add `app/src/lib/source-reach/doctor.ts`.
- Add `app/src/app/api/source-reach/doctor/route.ts`.
- Extend `app/src/lib/services/readability.ts` with safe Jina Reader fallback.
- Extend `app/bin/polanews.mjs` with `source-reach doctor`.
- Extend `app/src/lib/mcp/server.ts` with `source_reach_doctor`.
- Add delivery ledger and test matrix files.

## Stability and Security Gate

- Risk level: P2.
- No background job, DB schema, queue, scheduler or production config change.
- No secret value is printed; config is reported as boolean configured/missing only.
- Production deployment is rebuild/restart-only for supervisor `polanews`.

## Validation

- `python3 /Users/wangchang/.agents/skills/pola-test-gate/scripts/validate_function_test_cases.py --cases docs/pola/project-knowledge/delivery/2026-07-02-agent-reach-source-harness/function_test_cases.json --format json` passed.
- `node ./bin/polanews.mjs help` passed and listed `polanews source-reach doctor`.
- `npm run build` passed; Next route table included `/api/source-reach/doctor`.
- `npx tsx` offline doctor probe passed with 7 channels and `side_effect_free=true`.
- `npm run deploy:doctor` passed.
- `npx eslint app/src/lib/source-reach/doctor.ts app/src/app/api/source-reach/doctor/route.ts app/src/lib/services/readability.ts app/src/lib/mcp/server.ts app/bin/polanews.mjs` passed with 0 errors and 2 pre-existing warnings in `app/src/lib/mcp/server.ts`.
- `npm run lint` failed on pre-existing page issues outside task-owned files, including `broadcast/page.tsx`, `category/[name]/page.tsx`, `digest/page.tsx`, `saved/page.tsx`, `search/page.tsx`, and `starred/page.tsx`.
- `git diff --check` passed.
- Secret scan on task-owned files found no real secrets. It flagged existing CLI option variable names such as `token` and `password`, not credential values.

## Git Status

Repository had pre-existing unrelated dirty files before this task:

- `app/src/app/globals.css`
- `app/src/app/layout.tsx`
- `app/src/app/settings/page.tsx`
- `src/app/digest/[date]/page.tsx`
- Several untracked June docs.

This task will avoid modifying those files.

## Changed Files

- `app/src/lib/source-reach/doctor.ts`
- `app/src/app/api/source-reach/doctor/route.ts`
- `app/src/lib/services/readability.ts`
- `app/bin/polanews.mjs`
- `app/src/lib/mcp/server.ts`
- `docs/pola/project-knowledge/requirements/2026-07-02-agent-reach-source-harness-requirements.md`
- `docs/pola/project-knowledge/specs/2026-07-02-agent-reach-source-harness-prd.md`
- `docs/pola/project-knowledge/specs/2026-07-02-agent-reach-source-harness-spec.md`
- `docs/pola/project-knowledge/architecture/2026-07-02-agent-reach-source-harness-sdd.md`
- `docs/pola/project-knowledge/delivery/2026-07-02-agent-reach-source-harness/*`

## Release and Rollback

Release manifest: `docs/pola/project-knowledge/release/2026-07-02-agent-reach-source-harness-release.md`.

Server deployment is currently blocked by infrastructure reachability: `ssh pola-server` timed out during banner exchange and HTTPS to `https://aipd.me/polanews` timed out on 2026-07-02. Once the server responds, deploy by fast-forwarding `/opt/polanews` to `origin/main`, running `npm run build`, `npm run deploy:doctor`, and restarting supervisor `polanews`.

Rollback removes the new source-reach module and route, plus the small additions in CLI/MCP/readability.

## External Devlog Sync

`dws` CLI exists locally, but this request has no linked demand-pool record or AI table target for this new Agent-Reach source harness. To avoid writing the release note into the wrong table, external AI table sync is left pending target confirmation; local project knowledge and GitHub commit remain the source of truth for this delivery.
