import assert from 'node:assert/strict';
// Node 25 provides synchronous module hooks; the pinned Node 20 types do not declare it yet.
// @ts-expect-error Runtime API is available in the test environment.
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

type ResolveContext = Record<string, unknown>;
type NextResolve = (specifier: string, context: ResolveContext) => unknown;

registerHooks({
  resolve(specifier: string, context: ResolveContext, nextResolve: NextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Fall through to the default resolver so a useful native error is preserved.
      }
    }
    return nextResolve(specifier, context);
  },
});

Object.assign(process.env, {
  NODE_ENV: 'production',
  LLM_API_KEY: 'sk-test-secret-value-123456789',
  LLM_API_BASE: 'https://llm.invalid/v1',
  LLM_MODEL: 'MiniMax-M3',
});

const originalFetch = globalThis.fetch;
const {
  FEED_RETRY_BASE_MS,
  FEED_RETRY_MAX_MS,
  buildFeedSelectionClause,
  calculateFeedRetryDelayMs,
  calculateNextFeedRetryAt,
} = await import('../src/lib/rss/feed-retry');
const { translateArticleBatch } = await import('../src/lib/ai/llm');

after(() => {
  globalThis.fetch = originalFetch;
});

test('feed retry uses bounded exponential backoff and due-only scheduled selection', () => {
  assert.equal(calculateFeedRetryDelayMs(1), FEED_RETRY_BASE_MS);
  assert.equal(calculateFeedRetryDelayMs(2), FEED_RETRY_BASE_MS * 2);
  assert.equal(calculateFeedRetryDelayMs(8), FEED_RETRY_MAX_MS);
  assert.equal(calculateFeedRetryDelayMs(100), FEED_RETRY_MAX_MS);

  const now = new Date('2026-10-06T00:00:00.000Z');
  assert.equal(
    calculateNextFeedRetryAt(2, now).toISOString(),
    '2026-10-06T00:30:00.000Z'
  );

  const scheduled = buildFeedSelectionClause(false);
  assert.match(scheduled, /status = 'active'/);
  assert.match(scheduled, /status = 'error'/);
  assert.match(scheduled, /next_retry_at <= NOW\(\)/);

  assert.equal(buildFeedSelectionClause(true), "status IN ('active', 'error')");
});

type PromptItem = { idx: number; title: string; summary: string };

function getPromptItems(init?: RequestInit): PromptItem[] {
  const body = JSON.parse(String(init?.body || '{}')) as {
    messages?: Array<{ role?: string; content?: string }>;
  };
  const prompt = body.messages?.findLast((message) => message.role === 'user')?.content || '';
  const matches = [...prompt.matchAll(/^\[(\d+)] Title: (.*)\nSummary: (.*)$/gm)];
  return matches.map((match) => ({
    idx: Number(match[1]),
    title: match[2],
    summary: match[3],
  }));
}

function llmSuccess(items: PromptItem[]): Response {
  const content = JSON.stringify(items.map((item) => ({
    idx: item.idx,
    title_zh: `中文:${item.title}`,
    summary_zh: `摘要:${item.summary}`,
  })));
  return Response.json({ choices: [{ message: { content } }] });
}

function captureWarnings(): { lines: string[]; restore: () => void } {
  const originalWarn = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
  };
  return {
    lines,
    restore: () => {
      console.warn = originalWarn;
    },
  };
}

test('sensitive MiniMax 422 isolates one item without failing valid translations', async () => {
  let requests = 0;
  globalThis.fetch = async (_input, init) => {
    requests++;
    const items = getPromptItems(init);
    if (items.some((item) => item.title.includes('SENSITIVE'))) {
      return Response.json({
        type: 'error',
        error: {
          type: 'unprocessable_entity_error',
          message: 'input new_sensitive (1026) sk-test-secret-value-123456789',
          http_code: '422',
        },
      }, { status: 422 });
    }
    return llmSuccess(items);
  };

  const warnings = captureWarnings();
  try {
    const translated = await translateArticleBatch([
      { id: 'a', title: 'Alpha', summary: 'A' },
      { id: 'b', title: 'SENSITIVE item', summary: 'B' },
      { id: 'c', title: 'Charlie', summary: 'C' },
      { id: 'd', title: 'Delta', summary: 'D' },
    ]);

    assert.deepEqual(translated.map((item) => item.id), ['a', 'c', 'd']);
    assert.ok(requests > 1, 'the failed batch should be recursively split');
    const logText = warnings.lines.join('\n');
    assert.doesNotMatch(logText, /sk-test-secret-value/);
    assert.match(logText, /\[REDACTED_KEY]/);
  } finally {
    warnings.restore();
  }
});

test('malformed translation JSON isolates the bad item and preserves siblings', async () => {
  globalThis.fetch = async (_input, init) => {
    const items = getPromptItems(init);
    if (items.some((item) => item.title.includes('BROKEN'))) {
      return Response.json({ choices: [{ message: { content: 'not-json' } }] });
    }
    return llmSuccess(items);
  };

  const warnings = captureWarnings();
  try {
    const translated = await translateArticleBatch([
      { id: 'a', title: 'Alpha', summary: 'A' },
      { id: 'b', title: 'BROKEN response', summary: 'B' },
      { id: 'c', title: 'Charlie', summary: 'C' },
    ]);
    assert.deepEqual(translated.map((item) => item.id), ['a', 'c']);
    assert.match(warnings.lines.join('\n'), /Translation response did not contain a valid JSON array/);
  } finally {
    warnings.restore();
  }
});
