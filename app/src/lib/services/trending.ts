import { query } from '../db/schema';
import { callLLM } from '../ai/llm';

export interface TrendingKeyword {
  keyword: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
}

export interface TrendingTopic {
  topic: string;
  article_count: number;
  summary: string;
  articles: Array<{ id: string; title: string; published_at: string }>;
}

export async function extractTrendingKeywords(hours = 24): Promise<TrendingKeyword[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const articles = await query<{ title: string; title_zh: string; keywords: string[] }>(
    `SELECT title, title_zh, keywords FROM articles
     WHERE created_at >= $1
     ORDER BY created_at DESC LIMIT 200`, [since]
  );

  if (articles.length === 0) return [];

  const titles = articles.map(a => a.title_zh || a.title).join('\n');

  const systemPrompt = `你是一个新闻趋势分析助手。从以下新闻标题中提取最热门的 10-15 个关键词。
返回 JSON 数组，格式: [{"keyword": "关键词", "count": 出现次数估计, "trend": "up|down|stable"}]
只返回 JSON，不要其他文字。`;

  try {
    const result = await callLLM(titles.slice(0, 4000), systemPrompt);
    const match = result.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]) as TrendingKeyword[];
    }
  } catch (e) {
    console.error('[Trending] Keyword extraction error:', e);
  }

  const wordCount: Record<string, number> = {};
  for (const a of articles) {
    const words = (a.title_zh || a.title).split(/[\s,，.。!！?？;；:：、]+/).filter(w => w.length >= 2);
    for (const w of words) {
      wordCount[w] = (wordCount[w] || 0) + 1;
    }
  }

  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([keyword, count]) => ({ keyword, count, trend: 'stable' as const }));
}

export async function getTopicTimeline(topic: string, days = 7): Promise<Array<{ date: string; count: number }>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = await query<{ date: string; count: string }>(
    `SELECT DATE(created_at) as date, COUNT(*) as count
     FROM articles
     WHERE (title ILIKE $1 OR title_zh ILIKE $1 OR summary ILIKE $1)
       AND created_at >= $2
     GROUP BY DATE(created_at)
     ORDER BY date`, [`%${topic}%`, since]
  );

  return rows.map(r => ({ date: r.date, count: Number(r.count) }));
}

export async function getSentimentTrend(
  topic: string,
  days = 30
): Promise<Array<{ date: string; positive: number; neutral: number; negative: number }>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = await query<{ date: string; sentiment: string; count: string }>(
    `SELECT DATE(created_at) as date, sentiment, COUNT(*) as count
     FROM articles
     WHERE (title ILIKE $1 OR title_zh ILIKE $1)
       AND created_at >= $2
     GROUP BY DATE(created_at), sentiment
     ORDER BY date`, [`%${topic}%`, since]
  );

  const grouped: Record<string, { positive: number; neutral: number; negative: number }> = {};
  for (const r of rows) {
    if (!grouped[r.date]) grouped[r.date] = { positive: 0, neutral: 0, negative: 0 };
    const s = r.sentiment as 'positive' | 'neutral' | 'negative';
    if (s in grouped[r.date]) grouped[r.date][s] = Number(r.count);
  }

  return Object.entries(grouped).map(([date, v]) => ({ date, ...v }));
}
