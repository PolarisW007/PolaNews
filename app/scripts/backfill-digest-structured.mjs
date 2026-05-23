#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import pg from 'pg';
import {
  cleanDigestMarkdown,
  cleanDigestStory,
  cleanDigestText,
  cleanStructuredDigest,
  validateStructuredDigestQuality,
} from '../src/lib/digest-clean.ts';

const { Pool } = pg;

function readEnvFile(path) {
  const env = {};
  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanCategorySummaries(value) {
  const groups = parseJson(value, {});
  return Object.fromEntries(
    Object.entries(groups).map(([category, group]) => [
      cleanDigestText(category, { maxChars: 24 }) || category,
      {
        count: group?.count ?? group?.items?.length ?? 0,
        items: (group?.items || []).map((item) => ({
          ...item,
          ...cleanDigestStory(item),
        })),
      },
    ]),
  );
}

function collectStories(digest) {
  const headlines = parseJson(digest.headlines, []).map((item) => cleanDigestStory(item));
  const groups = cleanCategorySummaries(digest.category_summaries);
  const seen = new Set();
  const stories = [];

  for (const item of headlines) stories.push(item);
  for (const group of Object.values(groups)) {
    for (const item of group.items || []) stories.push(cleanDigestStory(item));
  }

  return stories.filter((story) => {
    const key = cleanDigestText(story.title, { maxChars: 80 });
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

async function callLLM(env, stories, date) {
  const apiKey = env.LLM_API_KEY || process.env.LLM_API_KEY || '';
  const apiBase = env.LLM_API_BASE || process.env.LLM_API_BASE || 'https://api.minimaxi.com/v1';
  const model = env.LLM_MODEL || process.env.LLM_MODEL || 'MiniMax-M2.7';
  if (!apiKey) return null;

  const articleList = stories.map((s, i) => (
    `${i + 1}. [${s.category || 'news'}] ${s.source || ''} | ${s.title}\n${s.summary}`
  )).join('\n\n');

  const systemPrompt = `你是 Daily Digest 主编。请把输入新闻改写成适合分享海报的精选阅读 JSON。
只返回合法 JSON。字段：
{"title": string, "lead": string, "top_stories": [{"title": string, "summary": string, "why_it_matters": string, "source": string, "category": string}], "quick_reads": [{"title": string, "summary": string, "source": string, "category": string}], "keywords": string[]}
要求：top_stories 3 条，quick_reads 4-5 条；summary 和 why_it_matters 不超过 80 字；不要出现 [Mock]、[general]、欢迎关注、公众号、更多精彩内容、Article URL、Comments URL。`;

  const res = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 2500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `日期：${date}\n\n${articleList}` },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

function fallbackStructured(stories) {
  return cleanStructuredDigest({
    title: '今日精选阅读',
    lead: stories[0]?.summary || '今天的重点资讯已整理为精选阅读。',
    top_stories: stories.slice(0, 3).map((story) => ({
      ...story,
      why_it_matters: story.why_it_matters || '这是今天值得优先掌握的关键变化。',
    })),
    quick_reads: stories.slice(3, 8),
    keywords: Array.from(new Set(stories.map((story) => story.category).filter(Boolean))).slice(0, 6),
  });
}

async function main() {
  const args = new Map();
  for (const arg of process.argv.slice(2)) {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    args.set(key, value);
  }

  const date = args.get('date');
  if (!date) throw new Error('Usage: node --experimental-strip-types scripts/backfill-digest-structured.mjs --date=YYYY-MM-DD [--lang=zh] [--dry-run]');

  const lang = args.get('lang') || 'zh';
  const dryRun = args.has('dry-run');
  const env = readEnvFile(args.get('env') || '.env.local');
  const pool = new Pool({ connectionString: env.DATABASE_URL || process.env.DATABASE_URL });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM daily_digests WHERE digest_date = $1 AND language = $2 ORDER BY created_at DESC LIMIT 1',
      [date, lang],
    );
    const digest = rows[0];
    if (!digest) throw new Error(`Digest not found: ${date} ${lang}`);

    const stories = collectStories(digest);
    let structured = null;
    try {
      structured = await callLLM(env, stories, date);
    } catch (e) {
      console.error('[Backfill] LLM structured generation failed, using fallback:', e.message);
    }

    const cleanedStructured = cleanStructuredDigest(structured || fallbackStructured(stories));
    const quality = validateStructuredDigestQuality(cleanedStructured);
    const statistics = {
      ...parseJson(digest.statistics, {}),
      structured_digest: cleanedStructured,
      quality_warnings: quality.violations,
    };
    const cleanedHeadlines = parseJson(digest.headlines, []).map((item) => ({
      ...item,
      ...cleanDigestStory(item),
    }));
    const cleanedCategories = cleanCategorySummaries(digest.category_summaries);
    const cleanedContent = cleanDigestMarkdown(digest.full_content || '');

    console.log(JSON.stringify({
      date,
      lang,
      dryRun,
      top_stories: cleanedStructured.top_stories.length,
      quick_reads: cleanedStructured.quick_reads.length,
      quality,
    }, null, 2));

    if (!dryRun) {
      await pool.query(
        `UPDATE daily_digests
         SET full_content = $1, headlines = $2, category_summaries = $3, statistics = $4
         WHERE id = $5`,
        [
          cleanedContent,
          JSON.stringify(cleanedHeadlines),
          JSON.stringify(cleanedCategories),
          JSON.stringify(statistics),
          digest.id,
        ],
      );
      console.log(`[Backfill] Updated digest ${digest.id}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
