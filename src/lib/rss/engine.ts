import Parser from 'rss-parser';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema';
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

/**
 * 抓取单个 feed，返回解析后的文章列表
 */
export async function fetchFeed(
  feedId: string,
  feedUrl: string
): Promise<FeedResult> {
  try {
    const feed = await parser.parseURL(feedUrl);
    const articles: ParsedArticle[] = (feed.items ?? []).map((item) => {
      let coverImage = '';
      try {
        coverImage = item.enclosure?.url || '';
      } catch { /* ignore */ }

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

/**
 * 从数据库获取所有 active 状态的 feeds，并行抓取（限制 10 并发），解析后存入 articles 表
 */
export async function fetchAllFeeds(): Promise<void> {
  const db = getDb();
  const feeds = db
    .prepare(
      `SELECT id, url FROM feeds WHERE status = 'active' ORDER BY last_fetched_at IS NULL DESC, last_fetched_at ASC`
    )
    .all() as { id: string; url: string }[];

  if (feeds.length === 0) return;

  const chunks: { id: string; url: string }[][] = [];
  for (let i = 0; i < feeds.length; i += CONCURRENCY_LIMIT) {
    chunks.push(feeds.slice(i, i + CONCURRENCY_LIMIT));
  }

  const insertArticle = db.prepare(`
    INSERT INTO articles (id, feed_id, title, url, author, content, summary, cover_image, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateFeedSuccess = db.prepare(`
    UPDATE feeds SET last_fetched_at = datetime('now'), error_count = 0 WHERE id = ?
  `);

  const incrementFeedError = db.prepare(`
    UPDATE feeds SET error_count = error_count + 1 WHERE id = ?
  `);

  const markFeedError = db.prepare(`
    UPDATE feeds SET status = 'error' WHERE id = ?
  `);

  const checkUrlExists = db.prepare(`SELECT 1 FROM articles WHERE url = ? LIMIT 1`);
  const getFeedErrorCount = db.prepare(`SELECT error_count FROM feeds WHERE id = ?`);

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map((f) => fetchFeed(f.id, f.url))
    );

    for (const settled of results) {
      if (settled.status === 'rejected') continue;
      const result = settled.value;

      if (result.success) {
        try {
          const tx = db.transaction(() => {
            for (const art of result.articles) {
              const articleUrl = String(art.url || '').trim();
              if (!articleUrl) continue;
              const exists = checkUrlExists.get(articleUrl);
              if (exists) continue;

              const params = [
                uuid(),
                String(result.feedId),
                String(art.title || 'Untitled'),
                articleUrl,
                String(art.author || ''),
                String(art.content || ''),
                String(art.summary || ''),
                String(art.coverImage || ''),
                String(art.publishedAt || new Date().toISOString()),
              ];
              insertArticle.run(...params);
            }
            updateFeedSuccess.run(result.feedId);
          });
          tx();
        } catch (e) {
          console.error(`Error saving articles for feed ${result.feedId}:`, e);
          incrementFeedError.run(result.feedId);
        }
      } else {
        const row = getFeedErrorCount.get(result.feedId) as { error_count: number } | undefined;
        const currentCount = row?.error_count ?? 0;
        const newCount = currentCount + 1;
        incrementFeedError.run(result.feedId);
        if (newCount >= ERROR_THRESHOLD) {
          markFeedError.run(result.feedId);
        }
      }
    }
  }
}

/**
 * 对未翻译的文章进行批量中文翻译（标题+摘要）
 */
export async function translateUntranslatedArticles(limit = 50): Promise<number> {
  const db = getDb();

  const rows = db.prepare(`
    SELECT a.id, a.title, a.summary FROM articles a
    INNER JOIN feeds f ON a.feed_id = f.id
    WHERE (a.title_zh IS NULL OR a.title_zh = '')
    ORDER BY a.published_at DESC, a.created_at DESC
    LIMIT ?
  `).all(limit) as { id: string; title: string; summary: string }[];

  if (rows.length === 0) return 0;

  const isLikelyChinese = (text: string) => {
    const zhCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    return zhCount > text.length * 0.3;
  };

  const needsTranslation = rows.filter(r => !isLikelyChinese(r.title));
  const alreadyChinese = rows.filter(r => isLikelyChinese(r.title));

  const updateStmt = db.prepare('UPDATE articles SET title_zh = ?, summary_zh = ? WHERE id = ?');

  for (const item of alreadyChinese) {
    updateStmt.run(item.title, item.summary, item.id);
  }

  if (needsTranslation.length === 0) return alreadyChinese.length;

  const translated = await translateArticleBatch(needsTranslation);

  const tx = db.transaction(() => {
    for (const item of translated) {
      updateStmt.run(item.title_zh, item.summary_zh, item.id);
    }
  });
  tx();

  return alreadyChinese.length + translated.length;
}

/**
 * 对未分类的文章进行 AI 自动分类
 */
export async function classifyUnclassifiedArticles(limit = 30): Promise<number> {
  const db = getDb();

  const rows = db.prepare(`
    SELECT id, title, summary FROM articles
    WHERE categories = '{}' OR categories IS NULL OR categories = ''
    ORDER BY published_at DESC
    LIMIT ?
  `).all(limit) as { id: string; title: string; summary: string }[];

  if (rows.length === 0) return 0;

  const updateStmt = db.prepare(
    'UPDATE articles SET categories = ?, importance = ?, sentiment = ?, region = ? WHERE id = ?'
  );

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

    const tx = db.transaction(() => {
      for (const settled of results) {
        if (settled.status !== 'fulfilled') continue;
        const r = settled.value;
        updateStmt.run(
          JSON.stringify({ topic: r.topic, region: r.region, importance: r.importance, sentiment: r.sentiment }),
          r.importance,
          r.sentiment,
          r.region,
          r.id
        );
        classified++;
      }
    });
    tx();
  }

  return classified;
}
