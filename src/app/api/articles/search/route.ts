import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';
import { rowToArticle, ARTICLE_JOIN } from '@/lib/db/helpers';
import type { Article } from '@/lib/types';

function extractSnippet(text: string, query: string, radius = 80): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = '';
  if (start > 0) snippet += '...';
  snippet += text.slice(start, end);
  if (end < text.length) snippet += '...';
  return snippet;
}

function rowToSearchArticle(row: Record<string, unknown>, query: string): Article & { snippet: string } {
  const content = (row.content as string) || '';
  const title = (row.title as string) || '';
  return {
    ...rowToArticle(row),
    snippet: extractSnippet(content || title, query),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();

    if (!q) {
      return NextResponse.json(
        { success: false, error: '缺少搜索关键词' },
        { status: 400 }
      );
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;
    const likePattern = `%${q}%`;

    const db = getDb();

    const searchWhere = `WHERE a.title LIKE ? OR a.content LIKE ?`;

    const { total } = db
      .prepare(`SELECT COUNT(*) as total ${ARTICLE_JOIN} ${searchWhere}`)
      .get(likePattern, likePattern) as { total: number };

    const rows = db
      .prepare(
        `SELECT a.*, f.title as feed_title, f.favicon_url as feed_favicon
         ${ARTICLE_JOIN} ${searchWhere}
         ORDER BY a.published_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(likePattern, likePattern, limit, offset) as Record<string, unknown>[];

    const articles = rows.map((row) => rowToSearchArticle(row, q));

    return NextResponse.json({
      success: true,
      data: { articles, total, page, limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
