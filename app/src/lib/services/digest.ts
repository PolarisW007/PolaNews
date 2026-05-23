import { v4 as uuid } from 'uuid';
import { query, queryOne, execute } from '../db/schema';
import { generateDigestContent, generateStructuredDigestContent } from '../ai/llm';
import {
  cleanDigestMarkdown,
  cleanDigestStory,
  cleanDigestText,
  cleanStructuredDigest,
  validateStructuredDigestQuality,
  type StructuredDigest,
} from '../digest-clean';

interface ArticleRow {
  id: string;
  feed_id: string;
  title: string;
  title_zh: string;
  summary: string;
  summary_zh: string;
  ai_summary: string;
  importance: string;
  categories: Record<string, string> | string;
  feed_title: string;
}

/** 选中文优先，回退英文；lang 只在需要时把中文换成英文 */
function pickTitle(r: ArticleRow, lang: string): string {
  const title = lang === 'zh' ? r.title_zh || r.title || '' : r.title || r.title_zh || '';
  return cleanDigestText(title, { maxChars: 90, maxSentenceChars: 90 });
}

function pickSummary(r: ArticleRow, lang: string): string {
  const title = pickTitle(r, lang);
  const summary = lang === 'zh'
    ? r.ai_summary || r.summary_zh || r.summary || r.title_zh || r.title || ''
    : r.ai_summary || r.summary || r.summary_zh || r.title || '';
  return cleanDigestText(summary, { title, maxChars: 180, maxSentenceChars: 90 });
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
  statistics: { total_articles: number; source_count: number; top_keywords: string[]; structured_digest?: StructuredDigest; quality_warnings?: string[] };
  trending_keywords: string[];
  full_content: string;
  created_at: string;
}

export async function generateDailyDigest(lang: string = 'zh'): Promise<DigestResult> {
  const digestDate = new Date().toISOString().slice(0, 10);
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  let rows = await query<ArticleRow>(
    `SELECT a.id, a.feed_id, a.title, a.title_zh, a.summary, a.summary_zh, a.ai_summary, a.importance, a.categories,
            f.title as feed_title
     FROM articles a
     INNER JOIN feeds f ON a.feed_id = f.id
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
      `SELECT a.id, a.feed_id, a.title, a.title_zh, a.summary, a.summary_zh, a.ai_summary, a.importance, a.categories,
              f.title as feed_title
       FROM articles a
       INNER JOIN feeds f ON a.feed_id = f.id
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
    title: pickTitle(r, lang),
    summary: pickSummary(r, lang),
    category: parseCategory(r.categories),
    importance: r.importance || 'normal',
    source: cleanDigestText(r.feed_title || '', { maxChars: 32 }),
  }));

  const structured = cleanStructuredDigest(await generateStructuredDigestContent(articlesForLLM, lang));
  const quality = validateStructuredDigestQuality(structured);
  const fullContent = cleanDigestMarkdown(await generateDigestContent(articlesForLLM, lang));

  const byCategory: Record<string, Array<{ id: string; title: string; summary: string }>> = {};
  for (const r of top20) {
    const cat = parseCategory(r.categories);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({
      id: r.id,
      title: pickTitle(r, lang),
      summary: pickSummary(r, lang),
    });
  }

  const headlines = top20.slice(0, 3).map((r) => ({
    title: cleanDigestStory({
      title: pickTitle(r, lang),
      summary: pickSummary(r, lang),
    }).title,
    summary: cleanDigestStory({
      title: pickTitle(r, lang),
      summary: pickSummary(r, lang),
    }).summary,
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
    structured_digest: structured,
    quality_warnings: quality.violations,
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
    statistics: (inserted.statistics as DigestResult['statistics']) || { total_articles: 0, source_count: 0, top_keywords: [], structured_digest: structured },
    trending_keywords: (inserted.trending_keywords as string[]) || [],
    full_content: (inserted.full_content as string) || '',
    created_at: (inserted.created_at as Date)?.toISOString() || '',
  };
}
