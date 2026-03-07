import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema';
import { generateDigestContent } from '../ai/llm';

const IMPORTANCE_ORDER: Record<string, number> = {
  breaking: 1,
  important: 2,
  normal: 3,
  low: 4,
};

interface ArticleRow {
  id: string;
  feed_id: string;
  title: string;
  summary: string;
  ai_summary: string;
  importance: string;
  categories: string;
}

function parseCategory(categoriesJson: string): string {
  try {
    const obj = JSON.parse(categoriesJson || '{}') as { topic?: string };
    return obj.topic || 'general';
  } catch {
    return 'general';
  }
}

export interface DigestResult {
  id: string;
  user_id: string | null;
  digest_date: string;
  language: string;
  headlines: Array<{ title: string; summary: string; article_id: string; importance: string; category: string }>;
  category_summaries: Record<string, { count: number; items: Array<{ title: string; summary: string; article_id: string }> }>;
  statistics: { total_articles: number; source_count: number; top_keywords: string[] };
  trending_keywords: string[];
  full_content: string;
  created_at: string;
}

export async function generateDailyDigest(
  lang: string = 'zh'
): Promise<DigestResult> {
  const db = getDb();
  const digestDate = new Date().toISOString().slice(0, 10);
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  let rows = db
    .prepare(
      `SELECT id, feed_id, title, summary, ai_summary, importance, categories
       FROM articles
       WHERE datetime(created_at) >= ?
       ORDER BY 
         CASE importance
           WHEN 'breaking' THEN 1
           WHEN 'important' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END,
         created_at DESC
       LIMIT 100`
    )
    .all(twelveHoursAgo) as ArticleRow[];

  if (rows.length < 5) {
    rows = db
      .prepare(
        `SELECT id, feed_id, title, summary, ai_summary, importance, categories
         FROM articles
         ORDER BY 
           CASE importance
             WHEN 'breaking' THEN 1
             WHEN 'important' THEN 2
             WHEN 'normal' THEN 3
             WHEN 'low' THEN 4
             ELSE 5
           END,
           created_at DESC
         LIMIT 100`
      )
      .all() as ArticleRow[];
  }

  const top20 = rows.slice(0, 20);
  const sourceCount = new Set(top20.map((r) => r.feed_id)).size;

  const articlesForLLM = top20.map((r) => ({
    title: r.title,
    summary: r.ai_summary || r.summary || r.title,
    category: parseCategory(r.categories),
    importance: r.importance || 'normal',
  }));

  const fullContent = await generateDigestContent(articlesForLLM, lang);

  const byCategory: Record<string, Array<{ id: string; title: string; summary: string }>> = {};
  for (const r of top20) {
    const cat = parseCategory(r.categories);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({
      id: r.id,
      title: r.title,
      summary: r.ai_summary || r.summary || r.title,
    });
  }

  const headlines = top20.slice(0, 3).map((r) => ({
    title: r.title,
    summary: r.ai_summary || r.summary || r.title,
    article_id: r.id,
    importance: r.importance || 'normal',
    category: parseCategory(r.categories),
  }));

  const category_summaries: Record<string, { count: number; items: Array<{ title: string; summary: string; article_id: string }> }> = {};
  for (const [cat, items] of Object.entries(byCategory)) {
    category_summaries[cat] = {
      count: items.length,
      items: items.map((i) => ({
        title: i.title,
        summary: i.summary,
        article_id: i.id,
      })),
    };
  }

  const statistics = {
    total_articles: top20.length,
    source_count: sourceCount,
    top_keywords: [] as string[],
  };

  const digestId = uuid();
  db.prepare(
    `INSERT INTO daily_digests (id, user_id, digest_date, language, headlines, category_summaries, statistics, trending_keywords, full_content)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    digestId,
    digestDate,
    lang,
    JSON.stringify(headlines),
    JSON.stringify(category_summaries),
    JSON.stringify(statistics),
    JSON.stringify([]),
    fullContent
  );

  const inserted = db.prepare('SELECT * FROM daily_digests WHERE id = ?').get(digestId) as {
    id: string;
    user_id: string | null;
    digest_date: string;
    language: string;
    headlines: string;
    category_summaries: string;
    statistics: string;
    trending_keywords: string;
    full_content: string;
    created_at: string;
  };

  return {
    id: inserted.id,
    user_id: inserted.user_id,
    digest_date: inserted.digest_date,
    language: inserted.language,
    headlines: JSON.parse(inserted.headlines || '[]'),
    category_summaries: JSON.parse(inserted.category_summaries || '{}'),
    statistics: JSON.parse(inserted.statistics || '{}'),
    trending_keywords: JSON.parse(inserted.trending_keywords || '[]'),
    full_content: inserted.full_content || '',
    created_at: inserted.created_at,
  };
}
