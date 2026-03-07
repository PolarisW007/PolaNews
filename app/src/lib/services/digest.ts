import { v4 as uuid } from 'uuid';
import { query, queryOne, execute } from '../db/schema';
import { generateDigestContent } from '../ai/llm';

interface ArticleRow {
  id: string;
  feed_id: string;
  title: string;
  summary: string;
  ai_summary: string;
  importance: string;
  categories: Record<string, string> | string;
}

function parseCategory(categories: Record<string, string> | string): string {
  if (typeof categories === 'object' && categories !== null) {
    return (categories as Record<string, string>).topic || 'general';
  }
  try {
    const obj = JSON.parse(String(categories) || '{}') as { topic?: string };
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

export async function generateDailyDigest(lang: string = 'zh'): Promise<DigestResult> {
  const digestDate = new Date().toISOString().slice(0, 10);
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  let rows = await query<ArticleRow>(
    `SELECT id, feed_id, title, summary, ai_summary, importance, categories
     FROM articles
     WHERE created_at >= $1
     ORDER BY
       CASE importance
         WHEN 'breaking' THEN 1
         WHEN 'important' THEN 2
         WHEN 'normal' THEN 3
         WHEN 'low' THEN 4
         ELSE 5
       END,
       created_at DESC
     LIMIT 100`, [twelveHoursAgo]
  );

  if (rows.length < 5) {
    rows = await query<ArticleRow>(
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
    );
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
      items: items.map((i) => ({ title: i.title, summary: i.summary, article_id: i.id })),
    };
  }

  const statistics = {
    total_articles: top20.length,
    source_count: sourceCount,
    top_keywords: [] as string[],
  };

  const digestId = uuid();
  await execute(
    `INSERT INTO daily_digests (id, user_id, digest_date, language, headlines, category_summaries, statistics, trending_keywords, full_content)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`,
    [digestId, digestDate, lang, JSON.stringify(headlines), JSON.stringify(category_summaries),
     JSON.stringify(statistics), '{}', fullContent]
  );

  const inserted = await queryOne(
    'SELECT * FROM daily_digests WHERE id = $1', [digestId]
  );

  if (!inserted) throw new Error('Failed to create digest');

  return {
    id: inserted.id as string,
    user_id: inserted.user_id as string | null,
    digest_date: String(inserted.digest_date),
    language: inserted.language as string,
    headlines: (inserted.headlines as DigestResult['headlines']) || [],
    category_summaries: (inserted.category_summaries as DigestResult['category_summaries']) || {},
    statistics: (inserted.statistics as DigestResult['statistics']) || { total_articles: 0, source_count: 0, top_keywords: [] },
    trending_keywords: (inserted.trending_keywords as string[]) || [],
    full_content: (inserted.full_content as string) || '',
    created_at: (inserted.created_at as Date)?.toISOString() || '',
  };
}
