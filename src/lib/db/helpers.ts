import type { Article, ArticleCategories } from '../types';

export function parseJson<T>(val: string | undefined | null, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export function rowToArticle(
  row: Record<string, unknown>,
  overrides?: Partial<Pick<Article, 'is_read' | 'is_starred' | 'is_saved'>>
): Article {
  return {
    id: row.id as string,
    feed_id: row.feed_id as string,
    title: row.title as string,
    url: row.url as string,
    author: (row.author as string) || '',
    content: (row.content as string) || '',
    summary: (row.summary as string) || '',
    ai_summary: (row.ai_summary as string) || '',
    ai_key_points: parseJson(row.ai_key_points as string, []),
    ai_summary_en: (row.ai_summary_en as string) || '',
    ai_summary_ja: (row.ai_summary_ja as string) || '',
    cover_image: (row.cover_image as string) || '',
    published_at: (row.published_at as string) || '',
    categories: parseJson(row.categories as string, {} as ArticleCategories),
    importance: (row.importance as Article['importance']) || 'normal',
    sentiment: (row.sentiment as Article['sentiment']) || 'neutral',
    region: (row.region as string) || 'global',
    keywords: parseJson(row.keywords as string, []),
    is_duplicate: Boolean(row.is_duplicate),
    duplicate_of: (row.duplicate_of as string) || null,
    created_at: row.created_at as string,
    feed_title: row.feed_title as string | undefined,
    feed_favicon: row.feed_favicon as string | undefined,
    title_zh: (row.title_zh as string) || '',
    summary_zh: (row.summary_zh as string) || '',
    is_read: overrides?.is_read ?? Boolean(row.is_read),
    is_starred: overrides?.is_starred ?? Boolean(row.is_starred),
    is_saved: overrides?.is_saved ?? Boolean(row.is_saved),
  };
}

export const ARTICLE_SELECT_FIELDS = `a.*, f.title as feed_title, f.favicon_url as feed_favicon`;
export const ARTICLE_JOIN = `FROM articles a INNER JOIN feeds f ON a.feed_id = f.id`;

export const USER_STATE_SELECT = `a.*, f.title as feed_title, f.favicon_url as feed_favicon,
  s.is_read, s.is_starred, s.is_saved, s.read_at`;
export const USER_STATE_JOIN = `FROM user_article_states s
  INNER JOIN articles a ON s.article_id = a.id
  INNER JOIN feeds f ON a.feed_id = f.id`;
