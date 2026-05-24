#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  cleanDigestMarkdown,
  cleanDigestText,
  cleanStructuredDigest,
  validateStructuredDigestQuality,
} from '../src/lib/digest-clean.ts';

const BLOCKED = [
  '[Mock]',
  'Mock',
  '[general]',
  '欢迎关注',
  '公众号',
  '更多精彩内容',
  '一句话摘要',
  '详细摘要',
  'Article URL',
  'Comments URL',
];

function assertCleanText(label, text) {
  for (const term of BLOCKED) {
    assert.equal(text.includes(term), false, `${label} still contains ${term}: ${text}`);
  }
}

function assertNoDuplicateTitleLines(label, markdown) {
  const lines = markdown.split('\n').filter(Boolean);
  for (const line of lines) {
    assert.equal(/^(.{6,160}?)\s+\1\s*[:：—-]/.test(line), false, `${label} has same-line duplicate: ${line}`);
  }
  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    assert.equal(
      next.startsWith(current) && /^[:：—-]/.test(next.slice(current.length).trim()),
      false,
      `${label} has cross-line duplicate: ${current} / ${next}`,
    );
  }
}

function runLocalHarness() {
  const dirty = [
    '[Mock] [general] 📌 一句话摘要：Codex 这波大更新后，Mac 的含金量再次提升',
    '📝 详细摘要：Codex 这波大更新后，Mac 的含金量再次提升: 要成为 OpenAI 最赚钱的产品',
    'Article URL: https://example.com/story Comments URL: https://news.ycombinator.com/item?id=1',
    '#欢迎关注爱范儿官方微信公众号：爱范儿，更多精彩内容第一时间为您奉上。',
  ].join('\n');

  const cleanedText = cleanDigestText(dirty, {
    title: 'Codex 这波大更新后，Mac 的含金量再次提升',
    maxChars: 120,
  });
  assertCleanText('cleanDigestText', cleanedText);
  assert.equal(cleanedText.includes('Article URL'), false);

  const duplicated = cleanDigestMarkdown([
    '# Daily Digest',
    'Codex 这波大更新后，Mac 的含金量再次提升',
    'Codex 这波大更新后，Mac 的含金量再次提升: 要成为 OpenAI 最赚钱的产品',
    '[Mock] [general] 第三代元 PLUS 上市：#欢迎关注爱范儿官方微信公众号：爱范儿，更多精彩内容第一时间为您奉上。',
  ].join('\n'));
  assertCleanText('cleanDigestMarkdown', duplicated);
  assertNoDuplicateTitleLines('cleanDigestMarkdown', duplicated);

  const structured = cleanStructuredDigest({
    title: 'Daily Digest (Mock)',
    lead: dirty,
    top_stories: [
      {
        title: '[general] OpenAI “赚一块亏一块二”，Anthropic 已开始赚钱',
        summary: dirty,
        why_it_matters: 'OpenAI “赚一块亏一块二”，Anthropic 已开始赚钱: 商业模式差异决定生死。',
      },
      { title: 'VSCode 团队详解 Agent-First Development 五大支柱', summary: '开发工具链全面 AI 化已成趋势。' },
      { title: 'Manus 创始人计划融资 10 亿美元回购公司', summary: 'AI 独角兽资本运作加速。' },
      { title: '多余项', summary: '不应进入 top stories。' },
    ],
    quick_reads: Array.from({ length: 8 }, (_, i) => ({
      title: `快速浏览 ${i + 1}`,
      summary: `这是第 ${i + 1} 条快速浏览内容，长度应该被控制在合理范围内。`,
    })),
    keywords: ['general', 'OpenAI', 'Anthropic', '公众号'],
  });
  const quality = validateStructuredDigestQuality(structured);
  assert.equal(structured.top_stories.length, 3);
  assert.equal(structured.quick_reads.length, 5);
  assert.equal(quality.ok, true, `structured quality failed: ${quality.violations.join(', ')}`);
  assertCleanText('structured digest', JSON.stringify(structured));

  return {
    local: 'pass',
    cleanedText,
    markdownLines: duplicated.split('\n').length,
    storyCount: structured.top_stories.length + structured.quick_reads.length,
  };
}

async function runRemoteHarness(url) {
  const expectedDate = new URL(url).searchParams.get('date');
  const res = await fetch(url, { cache: 'no-store' });
  assert.equal(res.ok, true, `remote HTTP ${res.status}`);
  const json = await res.json();
  assert.equal(json.success, true, 'remote API success must be true');
  const data = json.data || {};
  const structured = data.statistics?.structured_digest || {};
  const storyCount = (structured.top_stories || []).length + (structured.quick_reads || []).length;
  const corpus = JSON.stringify(data);
  assertCleanText('remote digest', corpus);
  assert.ok(storyCount >= 6 && storyCount <= 8, `remote storyCount out of range: ${storyCount}`);
  assertNoDuplicateTitleLines('remote full_content', data.full_content || '');
  if (expectedDate) {
    assert.equal(data.digest_date, expectedDate, `remote digest date should match ${expectedDate}`);
    assert.equal(res.headers.get('cache-control'), 'no-store', 'dated digest API should not be cached');
  }

  const stories = [...(structured.top_stories || []), ...(structured.quick_reads || [])];
  for (const story of stories) {
    assert.ok((story.summary || '').length <= 80, `summary too long: ${story.title}`);
    assert.ok((story.why_it_matters || '').length <= 80, `why_it_matters too long: ${story.title}`);
  }

  return {
    remote: 'pass',
    status: res.status,
    digest_date: data.digest_date,
    storyCount,
    cacheControl: res.headers.get('cache-control'),
  };
}

async function main() {
  const args = new Map();
  for (const arg of process.argv.slice(2)) {
    const normalized = arg.replace(/^--/, '');
    const eqIndex = normalized.indexOf('=');
    const key = eqIndex >= 0 ? normalized.slice(0, eqIndex) : normalized;
    const value = eqIndex >= 0 ? normalized.slice(eqIndex + 1) : 'true';
    args.set(key, value);
  }

  const result = { ...runLocalHarness() };
  if (args.has('url')) {
    Object.assign(result, await runRemoteHarness(args.get('url')));
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
