#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Parser from 'rss-parser';

const EXPECTED_FEEDS = [
  ['中国新闻网 即时', 'https://www.chinanews.com.cn/rss/scroll-news.xml'],
  ['中国新闻网 要闻', 'https://www.chinanews.com.cn/rss/importnews.xml'],
  ['中国新闻网 时政', 'https://www.chinanews.com.cn/rss/china.xml'],
  ['中国新闻网 社会', 'https://www.chinanews.com.cn/rss/society.xml'],
  ['中国新闻网 法治', 'https://www.chinanews.com.cn/rss/fz.xml'],
  ['澎湃新闻', 'https://plink.anyfeeder.com/thepaper'],
  ['界面新闻', 'https://plink.anyfeeder.com/jiemian/news'],
  ['南方周末 新闻', 'https://plink.anyfeeder.com/infzm/news'],
  ['南方周末 推荐', 'https://plink.anyfeeder.com/infzm/recommends'],
  ['Solidot', 'https://www.solidot.org/index.rss'],
  ['钛媒体', 'https://www.tmtpost.com/rss'],
  ['雷峰网', 'https://www.leiphone.com/feed'],
];

const FORBIDDEN = [
  '新华社',
  '新华网/新华社',
  '人民日报',
  'people-daily',
  'newscn/whxw',
];

function parseArgs() {
  const args = new Map();
  for (const raw of process.argv.slice(2)) {
    const normalized = raw.replace(/^--/, '');
    const eqIndex = normalized.indexOf('=');
    const key = eqIndex >= 0 ? normalized.slice(0, eqIndex) : normalized;
    const value = eqIndex >= 0 ? normalized.slice(eqIndex + 1) : 'true';
    args.set(key, value);
  }
  return args;
}

function parsePresetFeeds() {
  const source = readFileSync(new URL('../src/lib/rss/presets.ts', import.meta.url), 'utf8');
  const blocks = [...source.matchAll(/\{\s*title:\s*'([^']+)',\s*url:\s*'([^']+)',\s*site_url:\s*'([^']*)',\s*language:\s*'([^']+)',\s*category:\s*'([^']+)',\s*\}/g)];
  return blocks.map((match) => ({
    title: match[1],
    url: match[2],
    site_url: match[3],
    language: match[4],
    category: match[5],
  }));
}

function assertExpectedFeeds(feeds, label) {
  const byUrl = new Map(feeds.map((feed) => [feed.url, feed]));
  const duplicateUrls = feeds
    .map((feed) => feed.url)
    .filter((url, index, urls) => urls.indexOf(url) !== index);

  assert.deepEqual([...new Set(duplicateUrls)], [], `${label} contains duplicate feed URLs`);

  for (const [title, url] of EXPECTED_FEEDS) {
    const feed = byUrl.get(url);
    assert.ok(feed, `${label} missing expected feed: ${title} ${url}`);
    assert.equal(feed.title, title, `${label} title mismatch for ${url}`);
  }

  const corpus = feeds.map((feed) => `${feed.title}\n${feed.url}`).join('\n');
  for (const term of FORBIDDEN) {
    assert.equal(corpus.includes(term), false, `${label} should not include forbidden source: ${term}`);
  }
}

function newestDate(items) {
  const dates = items
    .map((item) => item.isoDate || item.pubDate)
    .map((date) => (date ? new Date(date).getTime() : NaN))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  return dates[0] ? new Date(dates[0]).toISOString() : '';
}

async function validateLiveFeeds(feeds) {
  const parser = new Parser();
  const expectedUrls = new Set(EXPECTED_FEEDS.map(([, url]) => url));
  const selected = feeds.filter((feed) => expectedUrls.has(feed.url));
  const results = [];

  for (const feed of selected) {
    const started = Date.now();
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': 'PolaNews feed harness/1.0 (+https://aipd.me/polanews)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
      },
    });
    assert.equal(res.ok, true, `${feed.title} HTTP ${res.status}`);
    const text = await res.text();
    const parsed = await parser.parseString(text);
    const items = parsed.items || [];
    assert.ok(items.length > 0, `${feed.title} should have at least one item`);
    results.push({
      title: feed.title,
      items: items.length,
      newest: newestDate(items),
      ms: Date.now() - started,
    });
  }

  return results;
}

async function validateApi(url) {
  const res = await fetch(url, { cache: 'no-store' });
  assert.equal(res.ok, true, `API HTTP ${res.status}`);
  const json = await res.json();
  assert.equal(json.success, true, 'API success must be true');
  const feeds = (json.data || []).map((feed) => ({
    title: feed.title,
    url: feed.url,
    category: feed.category,
    status: feed.status,
  }));
  assertExpectedFeeds(feeds, 'remote API feeds');
  return {
    status: res.status,
    feedCount: feeds.length,
    expectedStatuses: EXPECTED_FEEDS.map(([title, url]) => ({
      title,
      status: feeds.find((feed) => feed.url === url)?.status,
    })),
  };
}

async function main() {
  const args = parseArgs();
  const feeds = parsePresetFeeds();
  assertExpectedFeeds(feeds, 'preset feeds');

  const result = {
    local: 'pass',
    presetFeedCount: feeds.length,
    expectedFeedCount: EXPECTED_FEEDS.length,
  };

  if (args.has('live')) {
    result.live = await validateLiveFeeds(feeds);
  }

  if (args.has('api')) {
    result.remote = await validateApi(args.get('api'));
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
