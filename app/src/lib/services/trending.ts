import { query } from '../db/schema';
import { callLLM } from '../ai/llm';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'its',
  'it', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'his', 'her', 'their', 'our', 'your', 'my', 'we', 'they', 'he', 'she',
  'me', 'him', 'us', 'them', 'you', 'new', 'says', 'said', 'get', 'got',
  'also', 'like', 'even', 'way', 'see', 'now', 'first', 'two', 'one',
  'make', 'after', 'use', 'how', 'our', 'free', 'watch', 'every',
  '的', '了', '在', '是', '和', '我', '有', '他', '这', '中',
  '人', '大', '为', '上', '个', '国', '不', '以', '会', '与',
]);

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

type ArticleTitles = { title: string; title_zh: string; keywords: string[] };
type KeywordCacheEntry = { data: TrendingKeyword[]; expiresAt: number; refreshing: boolean };
const keywordCache = new Map<number, KeywordCacheEntry>();
const initialLoads = new Map<number, Promise<TrendingKeyword[]>>();
const KEYWORD_CACHE_TTL = 300_000;
const MAX_KEYWORD_CACHES = 4;

async function readRecentTitles(hours: number): Promise<ArticleTitles[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return query<ArticleTitles>(
    `SELECT title, title_zh, keywords FROM articles
     WHERE created_at >= $1
     ORDER BY created_at DESC LIMIT 200`, [since]
  );

}

function countKeywords(articles: ArticleTitles[]): TrendingKeyword[] {
  const wordCount: Record<string, number> = {};
  for (const a of articles) {
    const words = (a.title_zh || a.title).split(/[\s,，.。!！?？;；:：、\-\(\)\[\]"'""'']+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));
    for (const w of words) wordCount[w] = (wordCount[w] || 0) + 1;
  }
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([keyword, count]) => ({ keyword, count, trend: 'stable' as const }));
}

async function refreshKeywords(hours: number, entry: KeywordCacheEntry, initial?: ArticleTitles[]) {
  entry.refreshing = true;
  entry.expiresAt = Date.now() + KEYWORD_CACHE_TTL;
  try {
    const articles = initial || await readRecentTitles(hours);
    if (!articles.length) {
      entry.data = [];
      return;
    }

  const titles = articles.map(a => a.title_zh || a.title).join('\n');

  const systemPrompt = `你是一个新闻趋势分析助手。从以下新闻标题中提取最热门的 10-15 个关键词。
返回 JSON 数组，格式: [{"keyword": "关键词", "count": 出现次数估计, "trend": "up|down|stable"}]
只返回 JSON，不要其他文字。`;

    const result = await callLLM(titles.slice(0, 4000), systemPrompt);
    const match = result.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed: unknown = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        const keywords = parsed.filter((k): k is TrendingKeyword =>
          k && typeof k.keyword === 'string' && k.keyword.length >= 2
          && Number.isFinite(k.count) && ['up', 'down', 'stable'].includes(k.trend)
          && !STOP_WORDS.has(k.keyword.toLowerCase()));
        if (keywords.length) entry.data = keywords.slice(0, 15);
      }
    }
  } catch (e) {
    console.warn('[Trending] Keyword refresh failed', { error: e instanceof Error ? e.name : 'unknown' });
  } finally {
    entry.refreshing = false;
  }
}

export async function extractTrendingKeywords(hours = 24): Promise<TrendingKeyword[]> {
  const cached = keywordCache.get(hours);
  if (cached) {
    if (cached.expiresAt <= Date.now() && !cached.refreshing) {
      void refreshKeywords(hours, cached);
    }
    return cached.data;
  }
  const loading = initialLoads.get(hours);
  if (loading) return loading;
  const task = readRecentTitles(hours).then(articles => {
    const entry: KeywordCacheEntry = { data: countKeywords(articles), expiresAt: Date.now() + KEYWORD_CACHE_TTL, refreshing: false };
    keywordCache.set(hours, entry);
    if (keywordCache.size > MAX_KEYWORD_CACHES) {
      keywordCache.delete(keywordCache.keys().next().value!);
    }
    void refreshKeywords(hours, entry, articles);
    return entry.data;
  }).finally(() => initialLoads.delete(hours));
  initialLoads.set(hours, task);
  return task;
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
