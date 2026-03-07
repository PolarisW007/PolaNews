import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db/schema';
import { rowToArticle, ARTICLE_JOIN } from '@/lib/db/helpers';
import type { Article } from '@/lib/types';

function extractSnippet(text: string, q: string, radius = 80): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  let snippet = '';
  if (start > 0) snippet += '...';
  snippet += text.slice(start, end);
  if (end < text.length) snippet += '...';
  return snippet;
}

function rowToSearchArticle(row: Record<string, unknown>, q: string): Article & { snippet: string } {
  const content = (row.content as string) || '';
  const title = (row.title as string) || '';
  return {
    ...rowToArticle(row),
    snippet: extractSnippet(content || title, q),
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

    const searchWhere = `WHERE a.title LIKE $1 OR a.content LIKE $2`;

    const countResult = await queryOne(
      `SELECT COUNT(*) as total ${ARTICLE_JOIN} ${searchWhere}`,
      [likePattern, likePattern]
    ) as { total: number | string };
    const total = Number(countResult.total);

    const rows = await query(
      `SELECT a.*, f.title as feed_title, f.favicon_url as feed_favicon
       ${ARTICLE_JOIN} ${searchWhere}
       ORDER BY a.published_at DESC
       LIMIT $3 OFFSET $4`,
      [likePattern, likePattern, limit, offset]
    );

    const articles = rows.map((row) => rowToSearchArticle(row as Record<string, unknown>, q));

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
