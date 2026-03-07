import { query, queryOne } from '../db/schema';
import { rowToArticle } from '../db/helpers';
import { classifyArticle, summarizeArticle, generateDigestContent } from '../ai/llm';
import { fetchAllFeeds } from '../rss/engine';
import { generateDailyDigest } from '../services/digest';
import { extractTrendingKeywords } from '../services/trending';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: MCPTool[] = [
  {
    name: 'fetch_feeds',
    description: 'Fetch latest articles from all active RSS feeds',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 20 } } },
  },
  {
    name: 'classify_article',
    description: 'Classify an article by topic, region, importance and sentiment',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' } }, required: ['title'] },
  },
  {
    name: 'search_articles',
    description: 'Search articles by keyword',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['query'] },
  },
  {
    name: 'get_daily_digest',
    description: 'Get the latest daily digest',
    inputSchema: { type: 'object', properties: { lang: { type: 'string', default: 'zh' }, date: { type: 'string' } } },
  },
  {
    name: 'get_trending',
    description: 'Get trending topics and keywords',
    inputSchema: { type: 'object', properties: { hours: { type: 'number', default: 24 } } },
  },
  {
    name: 'summarize_article',
    description: 'Generate AI summary for an article',
    inputSchema: { type: 'object', properties: { article_id: { type: 'string' }, lang: { type: 'string', default: 'zh' } }, required: ['article_id'] },
  },
  {
    name: 'generate_digest',
    description: 'Generate a new daily digest',
    inputSchema: { type: 'object', properties: { lang: { type: 'string', default: 'zh' } } },
  },
  {
    name: 'manage_subscription',
    description: 'List all RSS feed subscriptions',
    inputSchema: { type: 'object', properties: {} },
  },
];

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'fetch_feeds': {
      const limit = Number(args.limit) || 20;
      const rows = await query(
        `SELECT a.*, f.title as feed_title, f.favicon_url as feed_favicon
         FROM articles a INNER JOIN feeds f ON a.feed_id = f.id
         ORDER BY a.published_at DESC NULLS LAST LIMIT $1`, [limit]
      );
      return rows.map(r => rowToArticle(r as Record<string, unknown>));
    }

    case 'classify_article': {
      const title = String(args.title || '');
      const summary = String(args.summary || '');
      return await classifyArticle(title, summary);
    }

    case 'search_articles': {
      const q = String(args.query || '');
      const limit = Number(args.limit) || 10;
      const rows = await query(
        `SELECT a.*, f.title as feed_title, f.favicon_url as feed_favicon
         FROM articles a INNER JOIN feeds f ON a.feed_id = f.id
         WHERE a.title ILIKE $1 OR a.content ILIKE $1 OR a.title_zh ILIKE $1
         ORDER BY a.published_at DESC NULLS LAST LIMIT $2`,
        [`%${q}%`, limit]
      );
      return rows.map(r => rowToArticle(r as Record<string, unknown>));
    }

    case 'get_daily_digest': {
      const lang = String(args.lang || 'zh');
      const dateFilter = args.date ? `AND digest_date = $2` : '';
      const params = args.date ? [lang, args.date] : [lang];
      const digest = await queryOne(
        `SELECT * FROM daily_digests WHERE language = $1 ${dateFilter}
         ORDER BY digest_date DESC, created_at DESC LIMIT 1`, params
      );
      return digest;
    }

    case 'get_trending': {
      const hours = Number(args.hours) || 24;
      return await extractTrendingKeywords(hours);
    }

    case 'summarize_article': {
      const articleId = String(args.article_id);
      const lang = String(args.lang || 'zh');
      const article = await queryOne(
        'SELECT title, content, summary FROM articles WHERE id = $1', [articleId]
      );
      if (!article) return { error: 'Article not found' };
      return await summarizeArticle(
        article.title as string,
        (article.content as string) || (article.summary as string) || '',
        lang
      );
    }

    case 'generate_digest': {
      const lang = String(args.lang || 'zh');
      return await generateDailyDigest(lang);
    }

    case 'manage_subscription': {
      return await query(`SELECT id, title, url, category, language, status FROM feeds ORDER BY category, title`);
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export const MCP_RESOURCES = [
  { uri: 'subscription://list', name: 'Feed Subscriptions', description: 'Current RSS feed subscriptions' },
  { uri: 'categories://taxonomy', name: 'Category Taxonomy', description: 'Classification categories' },
  { uri: 'digest://latest', name: 'Latest Digest', description: 'Most recent daily digest' },
  { uri: 'articles://recent?limit=50', name: 'Recent Articles', description: 'Latest 50 articles' },
];

export async function handleResourceRead(uri: string): Promise<unknown> {
  if (uri === 'subscription://list') {
    return await query(`SELECT id, title, url, category, language, status FROM feeds ORDER BY category, title`);
  }
  if (uri === 'categories://taxonomy') {
    return {
      topics: ['politics', 'economy', 'tech', 'military', 'society', 'culture', 'sports', 'health', 'environment', 'education'],
      regions: ['china', 'usa', 'europe', 'middle_east', 'asia_pacific', 'africa', 'latin_america', 'global'],
      importance: ['breaking', 'important', 'normal', 'low'],
      sentiment: ['positive', 'neutral', 'negative'],
    };
  }
  if (uri === 'digest://latest') {
    return await queryOne('SELECT * FROM daily_digests ORDER BY digest_date DESC, created_at DESC LIMIT 1');
  }
  if (uri.startsWith('articles://recent')) {
    const rows = await query(
      `SELECT a.*, f.title as feed_title FROM articles a
       INNER JOIN feeds f ON a.feed_id = f.id
       ORDER BY a.published_at DESC NULLS LAST LIMIT 50`
    );
    return rows;
  }
  return { error: 'Unknown resource' };
}
