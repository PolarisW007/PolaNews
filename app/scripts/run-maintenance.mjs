#!/usr/bin/env node

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...rest] = argument.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  }),
);

const action = args.get('action');
if (!['status', 'summaries', 'audio'].includes(action)) {
  console.error('Usage: node scripts/run-maintenance.mjs --action=status|summaries|audio [--from=ISO] [--to=ISO] [--limit=N] [--cursor=TOKEN]');
  process.exit(2);
}

const token = process.env.POLANEWS_OPS_TOKEN || '';
if (!token) {
  console.error('POLANEWS_OPS_TOKEN is not configured');
  process.exit(2);
}

const endpoint = new URL(
  process.env.POLANEWS_MAINTENANCE_URL || 'http://127.0.0.1:3456/polanews/api/ops/maintenance',
);
if (!['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname)) {
  console.error('POLANEWS_MAINTENANCE_URL must use a loopback hostname');
  process.exit(2);
}

const body = { action };
for (const key of ['from', 'to', 'cursor']) {
  if (typeof args.get(key) === 'string') body[key] = args.get(key);
}
if (typeof args.get('limit') === 'string') {
  const limit = Number(args.get('limit'));
  if (!Number.isInteger(limit)) {
    console.error('limit must be an integer');
    process.exit(2);
  }
  body.limit = limit;
}

try {
  const result = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PolaNews-Ops-Token': token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(
      action === 'status' ? 30_000 : action === 'audio' ? 25 * 60_000 : 12 * 60_000,
    ),
  });
  const responseBody = await result.json();
  console.log(JSON.stringify(responseBody, null, 2));
  if (!result.ok || responseBody?.data?.retry_required === true) process.exitCode = 1;
} catch (error) {
  console.error('Maintenance request failed:', error instanceof Error ? error.name : 'unknown');
  process.exitCode = 1;
}
