import { NextRequest, NextResponse } from 'next/server';
import { execute, query } from '@/lib/db/schema';
import { summarizeArticle } from '@/lib/ai/llm';
import { cleanDigestText } from '@/lib/digest-clean';
import type { ArticleAudioSourceRow } from '@/lib/services/tts';
import { synthesizeAndPersistArticleAudio } from '@/lib/services/tts';
import { timingSafeTokenEqual } from '@/lib/services/audio-retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WINDOW_MS = 14 * DAY_MS;
const SUMMARY_HARD_LIMIT = 20;
const AUDIO_HARD_LIMIT = 10;
const SUMMARY_CONCURRENCY = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MaintenanceAction = 'status' | 'summaries' | 'audio';
type BatchAction = Exclude<MaintenanceAction, 'status'>;

interface MaintenanceRequestBody {
  action?: unknown;
  from?: unknown;
  to?: unknown;
  limit?: unknown;
  cursor?: unknown;
}

interface MaintenanceWindow {
  from: Date;
  to: Date;
}

interface MaintenanceCursor {
  at: string;
  id: string;
}

interface SummaryRow {
  id: string;
  title: string;
  title_zh: string;
  summary: string;
  summary_zh: string;
  content: string;
  full_content: string;
  sort_at: Date | string;
}

interface AudioRow extends ArticleAudioSourceRow {
  sort_at: Date | string;
}

interface ItemResult {
  id: string;
  ok: boolean;
  code?: string;
}

let activeMaintenanceAction: BatchAction | null = null;

function response(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseAction(value: unknown): MaintenanceAction | null {
  return value === 'status' || value === 'summaries' || value === 'audio'
    ? value
    : null;
}

function parseTimestamp(value: unknown, fallback: Date): Date {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error('timestamps must be ISO-8601 values with an explicit timezone');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid timestamp');
  return parsed;
}

function parseWindow(body: MaintenanceRequestBody): MaintenanceWindow {
  const defaultTo = new Date();
  const to = parseTimestamp(body.to, defaultTo);
  const from = parseTimestamp(body.from, new Date(to.getTime() - 7 * DAY_MS));
  if (from.getTime() >= to.getTime()) throw new Error('from must be earlier than to');
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    throw new Error('maintenance window exceeds 14 days');
  }
  if (to.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new Error('to cannot be in the future');
  }
  return { from, to };
}

function parseLimit(value: unknown, fallback: number, hardLimit: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > hardLimit) {
    throw new Error(`limit must be an integer between 1 and ${hardLimit}`);
  }
  return value;
}

function decodeCursor(value: unknown): MaintenanceCursor | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 512) throw new Error('invalid cursor');
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<MaintenanceCursor>;
    const at = new Date(String(parsed.at || ''));
    if (Number.isNaN(at.getTime()) || !UUID_RE.test(String(parsed.id || ''))) {
      throw new Error('invalid cursor');
    }
    return { at: at.toISOString(), id: String(parsed.id) };
  } catch {
    throw new Error('invalid cursor');
  }
}

function encodeCursor(row: { sort_at: Date | string; id: string }): string {
  return Buffer.from(JSON.stringify({
    at: new Date(row.sort_at).toISOString(),
    id: row.id,
  })).toString('base64url');
}

function buildCursorQuery(
  window: MaintenanceWindow,
  cursor: MaintenanceCursor | null,
  limit: number,
): { clause: string; params: unknown[]; limitParameter: string } {
  const params: unknown[] = [window.from, window.to];
  let clause = '';
  if (cursor) {
    params.push(cursor.at, cursor.id);
    clause = `AND (
      COALESCE(published_at, created_at) > $3::timestamptz
      OR (COALESCE(published_at, created_at) = $3::timestamptz AND id > $4::uuid)
    )`;
  }
  params.push(limit);
  return { clause, params, limitParameter: `$${params.length}` };
}

function cleanSummarySource(text: string): string {
  return (text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/Article URL:.*?(?:\n|$)/gi, '')
    .replace(/Comments URL:.*?(?:\n|$)/gi, '')
    .replace(/Points:\s*\d+\n?/gi, '')
    .replace(/# Comments:\s*\d+\n?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyChinese(text: string): boolean {
  const cleaned = (text || '').replace(/\s/g, '');
  if (!cleaned) return false;
  const zhCount = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length;
  return zhCount > cleaned.length * 0.3;
}

function errorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  if (/abort|timeout/i.test(`${name} ${message}`)) return 'timeout';
  if (/provider|http|fetch/i.test(`${name} ${message}`)) return 'provider_error';
  return 'processing_error';
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<ItemResult>,
): Promise<ItemResult[]> {
  const results = new Array<ItemResult>(items.length);
  let nextIndex = 0;
  async function runner(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runner()),
  );
  return results;
}

async function status(window: MaintenanceWindow) {
  const rows = await query<{
    total: number;
    summaries_pending: number;
    audio_pending: number;
    audio_blocked_by_summary: number;
  }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE COALESCE(ai_summary, '') = '')::int AS summaries_pending,
       COUNT(*) FILTER (
         WHERE COALESCE(ai_summary, '') <> ''
           AND ((COALESCE(audio_url, '') = '') OR (COALESCE(audio_text_hash, '') = ''))
       )::int AS audio_pending,
       COUNT(*) FILTER (
         WHERE COALESCE(ai_summary, '') = ''
           AND ((COALESCE(audio_url, '') = '') OR (COALESCE(audio_text_hash, '') = ''))
       )::int AS audio_blocked_by_summary
     FROM articles
     WHERE COALESCE(published_at, created_at) >= $1
       AND COALESCE(published_at, created_at) < $2`,
    [window.from, window.to],
  );
  return rows[0] ?? {
    total: 0,
    summaries_pending: 0,
    audio_pending: 0,
    audio_blocked_by_summary: 0,
  };
}

async function runSummaryBatch(
  window: MaintenanceWindow,
  cursor: MaintenanceCursor | null,
  limit: number,
) {
  const cursorQuery = buildCursorQuery(window, cursor, limit);
  const rows = await query<SummaryRow>(
    `SELECT id, title, title_zh, summary, summary_zh, content, full_content,
            COALESCE(published_at, created_at) AS sort_at
     FROM articles
     WHERE COALESCE(published_at, created_at) >= $1
       AND COALESCE(published_at, created_at) < $2
       AND COALESCE(ai_summary, '') = ''
       ${cursorQuery.clause}
     ORDER BY COALESCE(published_at, created_at) ASC, id ASC
     LIMIT ${cursorQuery.limitParameter}`,
    cursorQuery.params,
  );

  const results = await mapWithConcurrency(rows, SUMMARY_CONCURRENCY, async (row) => {
    try {
      const title = (row.title_zh || row.title || '').trim();
      const source = cleanSummarySource(
        row.full_content || row.content || row.summary_zh || row.summary || title,
      ).slice(0, 6_000);
      if (!title && !source) return { id: row.id, ok: false, code: 'empty_source' };

      const generated = await summarizeArticle(title || row.title, source || title, 'zh');
      const summary = cleanDigestText((generated.summary || '').trim(), {
        title,
        maxChars: 260,
        maxSentenceChars: 110,
      });
      if (!summary || !isLikelyChinese(summary)) {
        return { id: row.id, ok: false, code: 'invalid_summary' };
      }
      const keyPoints = Array.isArray(generated.key_points)
        ? generated.key_points
          .map((point) => cleanDigestText(point, { title, maxChars: 80, maxSentenceChars: 80 }))
          .filter(Boolean)
        : [];
      const updated = await execute(
        `UPDATE articles
         SET ai_summary = $1, ai_key_points = $2, audio_url = '', audio_text_hash = ''
         WHERE id = $3 AND COALESCE(ai_summary, '') = ''`,
        [summary, JSON.stringify(keyPoints), row.id],
      );
      return updated > 0
        ? { id: row.id, ok: true }
        : { id: row.id, ok: false, code: 'already_processed' };
    } catch (error) {
      return { id: row.id, ok: false, code: errorCode(error) };
    }
  });

  return batchResponse(rows, results, limit);
}

async function runAudioBatch(
  window: MaintenanceWindow,
  cursor: MaintenanceCursor | null,
  limit: number,
) {
  const cursorQuery = buildCursorQuery(window, cursor, limit);
  const rows = await query<AudioRow>(
    `SELECT id, title, title_zh, summary, summary_zh, ai_summary, ai_key_points,
            COALESCE(published_at, created_at) AS sort_at
     FROM articles
     WHERE COALESCE(published_at, created_at) >= $1
       AND COALESCE(published_at, created_at) < $2
       AND COALESCE(ai_summary, '') <> ''
       AND ((COALESCE(audio_url, '') = '') OR (COALESCE(audio_text_hash, '') = ''))
       ${cursorQuery.clause}
     ORDER BY COALESCE(published_at, created_at) ASC, id ASC
     LIMIT ${cursorQuery.limitParameter}`,
    cursorQuery.params,
  );

  const results: ItemResult[] = [];
  for (const row of rows) {
    try {
      const generated = await synthesizeAndPersistArticleAudio(row);
      results.push(generated
        ? { id: row.id, ok: true }
        : { id: row.id, ok: false, code: 'not_generated' });
    } catch (error) {
      results.push({ id: row.id, ok: false, code: errorCode(error) });
    }
  }

  return batchResponse(rows, results, limit);
}

function batchResponse(
  rows: Array<{ id: string; sort_at: Date | string }>,
  results: ItemResult[],
  limit: number,
) {
  const failures = results
    .filter((result) => !result.ok)
    .map((result) => ({ id: result.id, code: result.code || 'processing_error' }));
  return {
    selected: rows.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: failures.length,
    failures,
    next_cursor: failures.length === 0 && rows.length === limit
      ? encodeCursor(rows[rows.length - 1])
      : null,
    retry_required: failures.length > 0,
  };
}

export async function POST(request: NextRequest) {
  const configuredToken = process.env.POLANEWS_OPS_TOKEN || '';
  if (!configuredToken) {
    return response({ success: false, error: 'maintenance endpoint is disabled' }, 503);
  }
  const suppliedToken = request.headers.get('x-polanews-ops-token') || '';
  if (!timingSafeTokenEqual(configuredToken, suppliedToken)) {
    return response({ success: false, error: 'unauthorized' }, 401);
  }

  let body: MaintenanceRequestBody;
  try {
    body = await request.json() as MaintenanceRequestBody;
  } catch {
    return response({ success: false, error: 'invalid JSON body' }, 400);
  }

  const action = parseAction(body.action);
  if (!action) return response({ success: false, error: 'invalid action' }, 400);

  let window: MaintenanceWindow;
  let cursor: MaintenanceCursor | null;
  try {
    window = parseWindow(body);
    cursor = decodeCursor(body.cursor);
  } catch (error) {
    return response({
      success: false,
      error: error instanceof Error ? error.message : 'invalid request',
    }, 400);
  }

  const windowPayload = {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
  };

  if (action === 'status') {
    const data = await status(window);
    return response({
      success: true,
      data: {
        window: windowPayload,
        active_action: activeMaintenanceAction,
        hard_limits: {
          window_days: MAX_WINDOW_MS / DAY_MS,
          summaries: SUMMARY_HARD_LIMIT,
          audio: AUDIO_HARD_LIMIT,
          summary_concurrency: SUMMARY_CONCURRENCY,
          audio_concurrency: 1,
        },
        ...data,
      },
    });
  }

  if (activeMaintenanceAction) {
    return response({
      success: false,
      error: 'another maintenance batch is already running',
      active_action: activeMaintenanceAction,
    }, 409);
  }

  let limit: number;
  try {
    limit = action === 'summaries'
      ? parseLimit(body.limit, 6, SUMMARY_HARD_LIMIT)
      : parseLimit(body.limit, 3, AUDIO_HARD_LIMIT);
  } catch (error) {
    return response({
      success: false,
      error: error instanceof Error ? error.message : 'invalid limit',
    }, 400);
  }

  activeMaintenanceAction = action;
  try {
    const data = action === 'summaries'
      ? await runSummaryBatch(window, cursor, limit)
      : await runAudioBatch(window, cursor, limit);
    console.log('[Ops Maintenance] batch completed', {
      action,
      selected: data.selected,
      succeeded: data.succeeded,
      failed: data.failed,
    });
    return response({ success: true, data: { action, window: windowPayload, ...data } });
  } catch (error) {
    console.error('[Ops Maintenance] batch failed', {
      action,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return response({ success: false, error: 'maintenance batch failed' }, 500);
  } finally {
    activeMaintenanceAction = null;
  }
}
