import Parser from 'rss-parser';
import { v4 as uuid } from 'uuid';
import { query, queryOne, execute, withTransaction } from '../db/schema';
import { translateArticleBatch, classifyArticle, summarizeArticle } from '../ai/llm';
import { synthesizePendingAudio } from '../services/tts';

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
          'UPDATE articles SET ai_summary = $1, ai_key_points = $2 WHERE id = $3',
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
}): Promise<IngestResult> {
  const translateLimit = options?.translateLimit ?? 100;
  const summaryLimit = options?.summaryLimit ?? 40;
  const classifyLimit = options?.classifyLimit ?? 60;
  const audioLimit = options?.audioLimit ?? 30;

  const result: IngestResult = {
    fetched: false,
    translated: 0,
    summarized: 0,
    classified: 0,
    audio_synthesized: 0,
  };

  if (!options?.skipFetch) {
    try {
      await fetchAllFeeds();
      result.fetched = true;
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
