const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(file, imports) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, URL, console: { warn() {} }, require(name) {
    if (name in imports) return imports[name];
    throw new Error('Unexpected import: ' + name);
  } });
  return exports;
}

const helpers = loadModule('src/lib/db/helpers.ts', {});
function loadSearch(Pool, options = {}) {
  return loadModule('src/lib/services/article-search.ts', {
    pg: { Pool }, '../db/schema': { getPool: () => ({ options }) }, '../db/helpers': helpers,
  });
}

async function main() {
  const tests = [];
  const test = (name, run) => tests.push([name, run]);
  function fixture({ ready = true, fail = false } = {}) {
    const calls = [], releases = [], pools = [], warnings = [];
    let connectFail = false;
    class Pool {
      constructor(options) { pools.push(options); }
      on(name, callback) { warnings.push([name, callback]); }
      async connect() {
        if (connectFail) throw new Error('private connection details');
        return {
          async query(sql, params) {
            calls.push({ sql, params });
            if (fail && sql.includes('COUNT(*)')) throw Object.assign(new Error('private database details'), { code: '57014' });
            if (sql.includes('to_regclass')) return { rows: [{ ready }] };
            if (sql.includes('COUNT(*)')) return { rows: [{ total: '3' }] };
            if (sql.includes('WITH matches')) return { rows: [{ id: 'fixture', title: 'AI title', content: 'A'.repeat(90) + 'AI' + 'B'.repeat(100), published_at: '2026-10-19' }] };
            return { rows: [] };
          },
          release(error) { releases.push(error); },
        };
      }
    }
    return { api: loadSearch(Pool), calls, releases, pools, warnings,
      failConnect(value) { connectFail = value; } };
  }

  test('projected search preserves fields/snippet, binds values and reads one snapshot', async () => {
    const f = fixture();
    const r = await f.api.searchArticles('AI', 2, 2);
    assert.equal(r.total, 3); assert.equal(r.page, 2); assert.equal(r.articles[0].id, 'fixture');
    assert.equal(r.articles[0].snippet, '...' + 'A'.repeat(80) + 'AI' + 'B'.repeat(80) + '...');
    assert.ok(f.calls[0].sql.includes('REPEATABLE READ READ ONLY'));
    assert.ok(f.calls.some(x => x.sql.includes('max_parallel_workers_per_gather = 0')));
    assert.ok(f.calls.find(x => x.sql.includes('COUNT(*)')).sql.includes('article_search_documents'));
    assert.equal(JSON.stringify(f.calls.find(x => x.sql.includes('WITH matches')).params), JSON.stringify(['%AI%', '%AI%', 2, 2]));
    assert.equal(f.calls.at(-1).sql, 'COMMIT'); assert.equal(f.releases[0], undefined);
    assert.equal(f.pools[0].max, 2); assert.equal(f.pools[0].statement_timeout, 5000);
    assert.equal(f.warnings[0][0], 'error');
  });
  test('missing projection retains old table and LIKE values', async () => {
    const f = fixture({ ready: false });
    await f.api.searchArticles("%'_", 1, 20);
    const count = f.calls.find(x => x.sql.includes('COUNT(*)'));
    assert.ok(count.sql.includes('FROM articles s'));
    assert.equal(count.params[0], "%%'_%");
    assert.ok(!count.sql.includes("%'_"));
  });
  test('query cancellation destroys the transaction and releases capacity', async () => {
    const f = fixture({ fail: true });
    await assert.rejects(f.api.searchArticles('AI', 1, 20), f.api.SearchUnavailableError);
    assert.ok(f.releases[0] instanceof Error || f.releases[0]?.message === 'Search transaction failed');
    assert.ok(!f.calls.some(x => x.sql === 'COMMIT'));
    await assert.rejects(f.api.searchArticles('AI', 1, 20), f.api.SearchUnavailableError);
    assert.equal(f.releases.length, 2);
  });
  test('connection failure does not leak an admission slot', async () => {
    const f = fixture(); f.failConnect(true);
    for (let i = 0; i < 3; i++) await assert.rejects(f.api.searchArticles('AI', 1, 2), f.api.SearchUnavailableError);
    f.failConnect(false); assert.equal((await f.api.searchArticles('AI', 1, 2)).total, 3);
  });
  test('third concurrent request is rejected without queueing another connection', async () => {
    const resolvers = [];
    class Pool {
      on() {}
      connect() { return new Promise(resolve => resolvers.push(resolve)); }
    }
    const api = loadSearch(Pool);
    const one = api.searchArticles('AI', 1, 2), two = api.searchArticles('AI', 1, 2);
    await assert.rejects(api.searchArticles('AI', 1, 2), api.SearchUnavailableError);
    assert.equal(resolvers.length, 2);
    for (const resolve of resolvers) resolve({ query: async sql => ({ rows: sql.includes('to_regclass') ? [{ ready: true }] : sql.includes('COUNT(*)') ? [{ total: '0' }] : [] }), release() {} });
    await Promise.all([one, two]);
  });

  let routeFailure, requestCount = 0;
  class SearchUnavailableError extends Error {}
  const route = loadModule('src/app/api/articles/search/route.ts', {
    'next/server': { NextResponse: { json(body, options = {}) { return { body, status: options.status || 200, headers: options.headers || {} }; } } },
    '@/lib/services/article-search': { SearchUnavailableError, async searchArticles(q, page, limit) {
      requestCount++; if (routeFailure) throw routeFailure; return { articles: [], q, page, limit, total: 0 };
    } },
  });
  for (const query of ['', 'q=%20', 'q=AI&page=NaN', 'q=AI&page=1.5', 'q=AI&page=-1', 'q=AI&limit=0', 'q=AI&limit=bad', 'q=AI&page=9007199254740991&limit=100', 'q=' + 'x'.repeat(2001)]) {
    test('invalid request returns 400: ' + query.slice(0, 45), async () => {
      const before = requestCount;
      assert.equal((await route.GET({ url: 'https://test/api/search?' + query })).status, 400);
      assert.equal(requestCount, before);
    });
  }
  test('valid request trims query and clamps limit', async () => {
    const r = await route.GET({ url: 'https://test/api/search?q=%20AI%20&limit=1000' });
    assert.equal(r.status, 200); assert.equal(r.body.data.q, 'AI'); assert.equal(r.body.data.limit, 100);
  });
  test('overload returns retryable 503 without private error details', async () => {
    routeFailure = new SearchUnavailableError('private connection string');
    const r = await route.GET({ url: 'https://test/api/search?q=AI' });
    assert.equal(r.status, 503); assert.equal(r.headers['Retry-After'], '2');
    assert.ok(!JSON.stringify(r).includes('private'));
  });
  test('unexpected failure is generic', async () => {
    routeFailure = new Error('private database details');
    const r = await route.GET({ url: 'https://test/api/search?q=AI' });
    assert.equal(r.status, 500); assert.ok(!JSON.stringify(r).includes('private'));
  });
  for (const [name, run] of tests) { await run(); console.log('PASS ' + name); }
  console.log(`PASS: ${tests.length} search service/route cases; no network or production writes`);
}

module.exports = { loadSearch, helpers };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
