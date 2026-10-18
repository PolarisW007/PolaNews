const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(require('node:path').join(__dirname, '../src/lib/services/trending.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));

async function main() {
  let now = 0, queries = 0, calls = 0, resolveModel;
  let rejectModel = false;
  class TestDate extends Date { static now() { return now; } }
  const exports = {};
  const warnings = [];
  vm.runInNewContext(compiled, {
    exports, Date: TestDate, console: { warn: (...args) => warnings.push(args) },
    require: name => {
      if (name === '../db/schema') return { query: async () => { queries++; return [{ title: 'Alpha Beta', title_zh: '', keywords: [] }]; } };
      if (name === '../ai/llm') return { callLLM: () => { calls++; return rejectModel ? Promise.reject(new Error('provider down')) : new Promise(resolve => { resolveModel = resolve; }); } };
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  const get = exports.extractTrendingKeywords;
  const cold = await Promise.all([get(), get(), get()]);
  assert.equal(queries, 1, 'Concurrent cold requests share one SELECT');
  assert.equal(calls, 1, 'Concurrent cold requests share one model call');
  assert.equal(cold[0][0].keyword, 'Alpha', 'Cold read returns without waiting for model');
  resolveModel('[{"keyword":"Enhanced","count":5,"trend":"up"},{"keyword":null},{"keyword":"Invalid","count":"bad","trend":"up"}]');
  await flush();
  const enhanced = await get();
  assert.equal(enhanced.length, 1, 'Malformed provider items are removed');
  assert.equal(enhanced[0].keyword, 'Enhanced', 'Completed model refresh replaces fallback');
  assert.equal(calls, 1, 'Warm read reuses model result');
  now = 300001;
  const stale = await Promise.all([get(), get()]);
  assert.equal(stale[0][0].keyword, 'Enhanced', 'Expired cache remains usable during refresh');
  await flush();
  assert.equal(calls, 2, 'Expired concurrent requests share one refresh');
  resolveModel('not valid model JSON');
  await flush();
  assert.equal((await get())[0].keyword, 'Enhanced', 'Invalid model output preserves prior result');
  now += 300001;
  rejectModel = true;
  await get();
  await flush();
  await get();
  assert.equal(calls, 3, 'Failed model refresh backs off for the full TTL');
  assert.equal(warnings.length, 1, 'One sanitized warning for failed refresh');
  for (let hours = 1; hours <= 5; hours++) await get(hours);
  await flush();
  const before = queries;
  await get(1);
  assert.equal(queries, before + 1, 'Oldest window evicted when capacity exceeds four');
  await flush();
  console.log('PASS: 12 trending cache assertions; no network or production writes');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
