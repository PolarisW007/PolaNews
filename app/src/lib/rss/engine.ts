import Parser from 'rss-parser';
import { v4 as uuid } from 'uuid';
import dns from 'node:dns';
import { query, queryOne, execute, withTransaction } from '../db/schema';
import { translateArticleBatch, classifyArticle, summarizeArticle } from '../ai/llm';
import { synthesizePendingAudio } from '../services/tts';

dns.setDefaultResultOrder('ipv4first');

const RSS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; PolaNews/1.0; +https://aipd.me/polanews)',
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
};

const parser = new Parser({
  headers: RSS_HEADERS,
  requestOptions: { family: 4 },
  timeout: 15_000,
});

export interface ParsedArticle {
  title: string;
  url: string;
  author?: string;
  content?: string;
  summary?: string;
  coverImage?: string;
  publishedAt?: string;
}

export interface FeedResult {
  feedId: string;
  articles: ParsedArticle[];
  success: boolean;
  error?: string;
}

function decodeEntities(text: string): string {
  return (text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanHtmlText(text: string): string {
  return decodeEntities(
    (text || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

async function fetchAnthropicNews(feedId: string): Promise<FeedResult> {
  const res = await fetch('https://www.anthropic.com/news', {
    headers: RSS_HEADERS,
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Anthropic news fallback failed: HTTP ${res.status}`);
  }

  const html = await res.text();
  const seen = new Set<string>();
  const articles: ParsedArticle[] = [];
  const linkPattern = /href="(\/news\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) && articles.length < 20) {
    const path = match[1];
    if (seen.has(path)) continue;
    seen.add(path);

    const text = cleanHtmlText(match[2]);
    if (!text) continue;

    const dateMatch = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/);
    const publishedAt = dateMatch ? new Date(dateMatch[0]).toISOString() : undefined;
    const summary = text.replace(/\b(?:Product|Announcements|Research|Policy|Company)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const title = (dateMatch ? summary.slice(dateMatch.index! + dateMatch[0].length) : summary)
      .replace(/^(?:Product|Announcements|Research|Policy|Company)\s+/i, '')
      .trim()
      .slice(0, 180);

    if (!title) continue;
    articles.push({
      title,
      url: `https://www.anthropic.com${path}`,
      author: 'Anthropic',
      content: summary,
      summary,
      publishedAt,
    });
  }

  if (articles.length === 0) {
    throw new Error('Anthropic news fallback found no articles');
  }

  return { feedId, articles, success: true };
}

export async function fetchFeed(feedId: string, feedUrl: string): Promise<FeedResult> {
  try {
    const feed = await parser.parseURL(feedUrl);
    const articles: ParsedArticle[] = (feed.items ?? []).map((item) => {
      let coverImage = '';
      try { coverImage = item.enclosure?.url || ''; } catch { /* ignore */ }
      return {
        title: item.title ?? '',
        url: item.link ?? '',
        author: item.creator ?? item.author ?? '',
        content: item.content ?? item.contentSnippet ?? '',
        summary: item.contentSnippet ?? '',
        coverImage,
        publishedAt: item.isoDate ?? item.pubDate ?? undefined,
      };
    });
    return { feedId, articles, success: true };
  } catch (err) {
    if (/^https:\/\/www\.anthropic\.com\/feed\/?$/i.test(feedUrl)) {
      try {
        return await fetchAnthropicNews(feedId);
      } catch (fallbackErr) {
        const message = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        return { feedId, articles: [], success: false, error: message };
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return { feedId, articles: [], success: false, error: message };
  }
}

const CONCURRENCY_LIMIT = 10;
const ERROR_THRESHOLD = 5;

export interface FetchAllFeedsOptions {
  includeErrored?: boolean;
  feedIds?: string[];
}

export interface FetchAllFeedsSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  recovered: number;
  new_articles: number;
  errors: { feed_id: string; title: string; error: string }[];
}

export async function fetchAllFeeds(options: FetchAllFeedsOptions = {}): Promise<FetchAllFeedsSummary> {
  const params: unknown[] = [];
  const statusClause = options.includeErrored
    ? "status IN ('active', 'error')"
    : "status = 'active'";
  let idClause = '';
  if (options.feedIds?.length) {
    params.push(options.feedIds);
    idClause = `AND id = ANY($${params.length}::uuid[])`;
  }

  const feeds = await query<{ id: string; title: string; url: string; status: string }>(
    `SELECT id, title, url, status FROM feeds
     WHERE ${statusClause} ${idClause}
     ORDER BY last_fetched_at IS NULL DESC, last_fetched_at ASC`,
    params
  );

  const summary: FetchAllFeedsSummary = {
    attempted: feeds.length,
    succeeded: 0,
    failed: 0,
    recovered: 0,
    new_articles: 0,
    errors: [],
  };
  if (feeds.length === 0) return summary;

  const chunks: { id: string; title: string; url: string; status: string }[][] = [];
  for (let i = 0; i < feeds.length; i += CONCURRENCY_LIMIT) {
    chunks.push(feeds.slice(i, i + CONCURRENCY_LIMIT));
  }

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map((f) => fetchFeed(f.id, f.url))
    );

    for (const settled of results) {
      if (settled.status === 'rejected') continue;
      const result = settled.value;
      const feed = chunk.find((f) => f.id === result.feedId);

      if (result.success) {
        try {
          let inserted = 0;
          await withTransaction(async (client) => {
            for (const art of result.articles) {
              const articleUrl = String(art.url || '').trim();
              if (!articleUrl) continue;
              const exists = await client.query('SELECT 1 FROM articles WHERE url = $1 LIMIT 1', [articleUrl]);
              if (exists.rows.length > 0) continue;

              const safeStr = (v: unknown) => {
                if (v === null || v === undefined) return '';
                if (typeof v === 'string') return v;
                try { return JSON.stringify(v); } catch { return ''; }
              };

              await client.query(
                `INSERT INTO articles (id, feed_id, title, url, author, content, summary, cover_image, published_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                  uuid(), String(result.feedId), safeStr(art.title) || 'Untitled',
                  articleUrl, safeStr(art.author), safeStr(art.content),
                  safeStr(art.summary), safeStr(art.coverImage),
                  art.publishedAt ? new Date(art.publishedAt).toISOString() : new Date().toISOString(),
                ]
              );
              inserted++;
            }
            await client.query(
              `UPDATE feeds SET last_fetched_at = NOW(), error_count = 0, status = 'active' WHERE id = $1`,
              [result.feedId]
            );
          });
          summary.succeeded++;
          summary.new_articles += inserted;
          if (feed?.status === 'error') summary.recovered++;
        } catch (e) {
          console.error(`Error saving articles for feed ${result.feedId}:`, e);
          await execute('UPDATE feeds SET error_count = error_count + 1 WHERE id = $1', [result.feedId]);
          summary.failed++;
          summary.errors.push({
            feed_id: result.feedId,
            title: feed?.title || result.feedId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        const row = await queryOne<{ error_count: number }>('SELECT error_count FROM feeds WHERE id = $1', [result.feedId]);
        const newCount = (row?.error_count ?? 0) + 1;
        await execute('UPDATE feeds SET error_count = error_count + 1 WHERE id = $1', [result.feedId]);
        if (newCount >= ERROR_THRESHOLD) {
          await execute(`UPDATE feeds SET status = 'error' WHERE id = $1`, [result.feedId]);
        }
        summary.failed++;
        summary.errors.push({
          feed_id: result.feedId,
          title: feed?.title || result.feedId,
          error: result.error || 'Unknown feed error',
        });
      }
    }
  }

  return summary;
}

function isLikelyChinese(text: string) {
  const cleaned = (text || '').replace(/\s/g, '');
  if (!cleaned) return false;
  const zhCount = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length;
  return zhCount > cleaned.length * 0.3;
}

export async function translateUntranslatedArticles(limit = 50): Promise<number> {
  const rows = await query<{ id: string; title: string; summary: string; title_zh: string | null; summary_zh: string | null }>(
    `SELECT a.id, a.title, a.summary, a.title_zh, a.summary_zh FROM articles a
     INNER JOIN feeds f ON a.feed_id = f.id
     WHERE (a.title_zh IS NULL OR a.title_zh = '' OR (a.title_zh = a.title AND a.title !~ '[一-龥]'))
     ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
     LIMIT $1`, [limit]
  );
  if (rows.length === 0) return 0;

  const candidates = rows.filter((r) => {
    const titleZh = (r.title_zh || '').trim();
    if (!titleZh) return true;
    return titleZh === r.title && !isLikelyChinese(r.title);
  });
  if (candidates.length === 0) return 0;

  const needsTranslation = candidates.filter(r => !isLikelyChinese(r.title));
  const alreadyChinese = candidates.filter(r => isLikelyChinese(r.title));

  for (const item of alreadyChinese) {
    await execute('UPDATE articles SET title_zh = $1, summary_zh = $2 WHERE id = $3', [item.title, item.summary, item.id]);
  }

  if (needsTranslation.length === 0) return alreadyChinese.length;

  const translated = await translateArticleBatch(needsTranslation);

  await withTransaction(async (client) => {
    for (const item of translated) {
      const original = needsTranslation.find((row) => row.id === item.id);
      if (!original) continue;

      const translatedText = `${item.title_zh || ''}\n${item.summary_zh || ''}`;
      const changed = item.title_zh !== original.title || item.summary_zh !== original.summary;
      if (!changed && !isLikelyChinese(translatedText)) {
        continue;
      }

      await client.query('UPDATE articles SET title_zh = $1, summary_zh = $2 WHERE id = $3', [item.title_zh, item.summary_zh, item.id]);
    }
  });

  const successfulTranslations = translated.filter((item) => {
    const original = needsTranslation.find((row) => row.id === item.id);
    if (!original) return false;
    const translatedText = `${item.title_zh || ''}\n${item.summary_zh || ''}`;
    return item.title_zh !== original.title || item.summary_zh !== original.summary || isLikelyChinese(translatedText);
  }).length;

  return alreadyChinese.length + successfulTranslations;
}

export async function classifyUnclassifiedArticles(limit = 30): Promise<number> {
  const rows = await query<{ id: string; title: string; summary: string }>(
    `SELECT id, title, summary FROM articles
     WHERE categories = '{}'::jsonb OR categories IS NULL
     ORDER BY published_at DESC NULLS LAST
     LIMIT $1`, [limit]
  );
  if (rows.length === 0) return 0;

  let classified = 0;
  const BATCH = 5;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const result = await classifyArticle(row.title, row.summary || '');
        return { id: row.id, ...result };
      })
    );

    await withTransaction(async (client) => {
      for (const settled of results) {
        if (settled.status !== 'fulfilled') continue;
        const r = settled.value;
        await client.query(
          'UPDATE articles SET categories = $1, importance = $2, sentiment = $3, region = $4 WHERE id = $5',
          [JSON.stringify({ topic: r.topic, region: r.region, importance: r.importance, sentiment: r.sentiment }),
           r.importance, r.sentiment, r.region, r.id]
        );
        classified++;
      }
    });
  }

  return classified;
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

/**
 * 为抓取后的文章默认生成中文 AI 摘要，并持久化到 articles.ai_summary。
 * 这是详情页懒生成的后台化版本，保证首页/详情/语音播报读取同一份中文摘要。
 */
export async function summarizeMissingChineseArticles(limit = 30): Promise<number> {
  const rows = await query<{
    id: string;
    title: string;
    title_zh: string;
    summary: string;
    summary_zh: string;
    content: string;
    full_content: string;
  }>(
    `SELECT id, title, title_zh, summary, summary_zh, content, full_content
     FROM articles
     WHERE (ai_summary IS NULL OR ai_summary = '')
       AND (
         (title_zh IS NOT NULL AND title_zh <> '')
         OR (summary_zh IS NOT NULL AND summary_zh <> '')
       )
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $1`,
    [limit]
  );

  if (rows.length === 0) return 0;

  let summarized = 0;
  const CONCURRENCY = 3;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const title = (row.title_zh || row.title || '').trim();
        const source = cleanSummarySource(
          row.full_content || row.content || row.summary_zh || row.summary || title
        ).slice(0, 6000);
        if (!title && !source) return null;

        const result = await summarizeArticle(title || row.title, source || title, 'zh');
        const summary = (result.summary || '').trim();
        if (!summary || !isLikelyChinese(summary)) return null;

        return {
          id: row.id,
          summary,
          key_points: Array.isArray(result.key_points) ? result.key_points : [],
        };
      })
    );

    await withTransaction(async (client) => {
      for (const settled of results) {
        if (settled.status !== 'fulfilled' || !settled.value) continue;
        await client.query(
          `UPDATE articles
           SET ai_summary = $1, ai_key_points = $2, audio_url = '', audio_text_hash = ''
           WHERE id = $3`,
          [settled.value.summary, JSON.stringify(settled.value.key_points), settled.value.id]
        );
        summarized++;
      }
    });
  }

  return summarized;
}

export interface IngestResult {
  fetched: boolean;
  feed_attempted: number;
  feed_succeeded: number;
  feed_failed: number;
  feed_recovered: number;
  new_articles: number;
  feed_errors: { feed_id: string; title: string; error: string }[];
  translated: number;
  summarized: number;
  classified: number;
  audio_synthesized: number;
  error?: string;
}

/**
 * 全量增量处理管道：抓取 RSS → 翻译新文章 → 生成中文 AI 摘要 → 分类 → 合成中文语音。
 * 用于 scheduler（每 2 小时）与 /api/feeds/fetch 手动触发，保持行为一致。
 * 任一子步骤失败仅记录日志，不中断后续步骤。
 */
export async function runFullIngest(options?: {
  translateLimit?: number;
  summaryLimit?: number;
  classifyLimit?: number;
  audioLimit?: number;
  skipFetch?: boolean;
  includeErroredFeeds?: boolean;
  feedIds?: string[];
}): Promise<IngestResult> {
  const translateLimit = options?.translateLimit ?? 100;
  const summaryLimit = options?.summaryLimit ?? 40;
  const classifyLimit = options?.classifyLimit ?? 60;
  const audioLimit = options?.audioLimit ?? 30;

  const result: IngestResult = {
    fetched: false,
    feed_attempted: 0,
    feed_succeeded: 0,
    feed_failed: 0,
    feed_recovered: 0,
    new_articles: 0,
    feed_errors: [],
    translated: 0,
    summarized: 0,
    classified: 0,
    audio_synthesized: 0,
  };

  if (!options?.skipFetch) {
    try {
      const fetchSummary = await fetchAllFeeds({
        includeErrored: options?.includeErroredFeeds,
        feedIds: options?.feedIds,
      });
      result.fetched = true;
      result.feed_attempted = fetchSummary.attempted;
      result.feed_succeeded = fetchSummary.succeeded;
      result.feed_failed = fetchSummary.failed;
      result.feed_recovered = fetchSummary.recovered;
      result.new_articles = fetchSummary.new_articles;
      result.feed_errors = fetchSummary.errors.slice(0, 10);
    } catch (e) {
      console.error('[Pipeline] fetchAllFeeds failed:', e);
      result.error = e instanceof Error ? e.message : String(e);
    }
  }

  try {
    result.translated = await translateUntranslatedArticles(translateLimit);
  } catch (e) {
    console.error('[Pipeline] translateUntranslatedArticles failed:', e);
  }

  try {
    result.summarized = await summarizeMissingChineseArticles(summaryLimit);
  } catch (e) {
    console.error('[Pipeline] summarizeMissingChineseArticles failed:', e);
  }

  try {
    result.classified = await classifyUnclassifiedArticles(classifyLimit);
  } catch (e) {
    console.error('[Pipeline] classifyUnclassifiedArticles failed:', e);
  }

  if (audioLimit > 0) {
    try {
      result.audio_synthesized = await synthesizePendingAudio(audioLimit);
    } catch (e) {
      console.error('[Pipeline] synthesizePendingAudio failed:', e);
    }
  }

  console.log('[Pipeline] runFullIngest done:', result);
  return result;
}
