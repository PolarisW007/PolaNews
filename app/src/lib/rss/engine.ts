import Parser from 'rss-parser';
import { v4 as uuid } from 'uuid';
import { query, queryOne, execute, withTransaction } from '../db/schema';
import { translateArticleBatch, classifyArticle } from '../ai/llm';

const parser = new Parser();

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
    const message = err instanceof Error ? err.message : String(err);
    return { feedId, articles: [], success: false, error: message };
  }
}

const CONCURRENCY_LIMIT = 10;
const ERROR_THRESHOLD = 5;

export async function fetchAllFeeds(): Promise<void> {
  const feeds = await query<{ id: string; url: string }>(
    `SELECT id, url FROM feeds WHERE status = 'active' ORDER BY last_fetched_at IS NULL DESC, last_fetched_at ASC`
  );
  if (feeds.length === 0) return;

  const chunks: { id: string; url: string }[][] = [];
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

      if (result.success) {
        try {
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
            }
            await client.query(`UPDATE feeds SET last_fetched_at = NOW(), error_count = 0 WHERE id = $1`, [result.feedId]);
          });
        } catch (e) {
          console.error(`Error saving articles for feed ${result.feedId}:`, e);
          await execute('UPDATE feeds SET error_count = error_count + 1 WHERE id = $1', [result.feedId]);
        }
      } else {
        const row = await queryOne<{ error_count: number }>('SELECT error_count FROM feeds WHERE id = $1', [result.feedId]);
        const newCount = (row?.error_count ?? 0) + 1;
        await execute('UPDATE feeds SET error_count = error_count + 1 WHERE id = $1', [result.feedId]);
        if (newCount >= ERROR_THRESHOLD) {
          await execute(`UPDATE feeds SET status = 'error' WHERE id = $1`, [result.feedId]);
        }
      }
    }
  }
}

export async function translateUntranslatedArticles(limit = 50): Promise<number> {
  const rows = await query<{ id: string; title: string; summary: string }>(
    `SELECT a.id, a.title, a.summary FROM articles a
     INNER JOIN feeds f ON a.feed_id = f.id
     WHERE (a.title_zh IS NULL OR a.title_zh = '')
     ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
     LIMIT $1`, [limit]
  );
  if (rows.length === 0) return 0;

  const isLikelyChinese = (text: string) => {
    const zhCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    return zhCount > text.length * 0.3;
  };

  const needsTranslation = rows.filter(r => !isLikelyChinese(r.title));
  const alreadyChinese = rows.filter(r => isLikelyChinese(r.title));

  for (const item of alreadyChinese) {
    await execute('UPDATE articles SET title_zh = $1, summary_zh = $2 WHERE id = $3', [item.title, item.summary, item.id]);
  }

  if (needsTranslation.length === 0) return alreadyChinese.length;

  const translated = await translateArticleBatch(needsTranslation);

  await withTransaction(async (client) => {
    for (const item of translated) {
      await client.query('UPDATE articles SET title_zh = $1, summary_zh = $2 WHERE id = $3', [item.title_zh, item.summary_zh, item.id]);
    }
  });

  return alreadyChinese.length + translated.length;
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
