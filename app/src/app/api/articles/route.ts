import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db/schema';
import { parseJsonField, ARTICLE_JOIN } from '@/lib/db/helpers';

const SUMMARY_MAX_LEN = 300;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function truncate(s: string | undefined | null, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const category = searchParams.get('category') || undefined;
    const importance = searchParams.get('importance') || undefined;
    const search = searchParams.get('search') || undefined;
    const feed_id = searchParams.get('feed_id') || undefined;
    const sentiment = searchParams.get('sentiment') || undefined;
    const region = searchParams.get('region') || undefined;
    const date_from = searchParams.get('date_from') || undefined;
    const date_to = searchParams.get('date_to') || undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (category) {
      conditions.push(`f.category = $${paramIdx++}`);
      params.push(category);
    }
    if (importance) {
      conditions.push(`a.importance = $${paramIdx++}`);
      params.push(importance);
    }
    if (search) {
      conditions.push(`a.title ILIKE $${paramIdx++}`);
      params.push(`%${search}%`);
    }
    if (feed_id) {
      conditions.push(`a.feed_id = $${paramIdx++}`);
      params.push(feed_id);
    }
    if (sentiment) {
      conditions.push(`a.sentiment = $${paramIdx++}`);
      params.push(sentiment);
    }
    if (region) {
      conditions.push(`a.region = $${paramIdx++}`);
      params.push(region);
    }
    if (date_from) {
      conditions.push(`a.published_at >= $${paramIdx++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`a.published_at <= $${paramIdx++}`);
      params.push(date_to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countSql = `SELECT COUNT(*) as total ${ARTICLE_JOIN} ${whereClause}`;
    const countResult = await queryOne(countSql, params) as { total: number | string };
    const total = Number(countResult.total);

    const listSql = `SELECT a.id, a.feed_id, a.title, a.url, a.author,
      LEFT(a.summary, ${SUMMARY_MAX_LEN + 50}) as summary,
      a.ai_summary, a.cover_image, a.published_at, a.categories, a.importance,
      a.sentiment, a.region, a.is_duplicate, a.created_at,
      a.title_zh, LEFT(a.summary_zh, ${SUMMARY_MAX_LEN + 50}) as summary_zh,
      f.title as feed_title, f.favicon_url as feed_favicon
      ${ARTICLE_JOIN} ${whereClause}
      ORDER BY a.published_at DESC, a.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;

    const rows = await query(listSql, [...params, limit, offset]);
    const articles = rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      feed_id: r.feed_id as string,
      title: (r.title as string) || '',
      url: (r.url as string) || '',
      author: (r.author as string) || '',
      summary: truncate(r.summary as string, SUMMARY_MAX_LEN),
      ai_summary: truncate(r.ai_summary as string, SUMMARY_MAX_LEN),
      cover_image: (r.cover_image as string) || '',
      published_at: r.published_at ? new Date(r.published_at as string).toISOString() : '',
      categories: parseJsonField(r.categories, {}),
      importance: (r.importance as string) || 'normal',
      sentiment: (r.sentiment as string) || 'neutral',
      region: (r.region as string) || 'global',
      is_duplicate: Boolean(r.is_duplicate),
      created_at: r.created_at ? new Date(r.created_at as string).toISOString() : '',
      feed_title: (r.feed_title as string) || '',
      feed_favicon: (r.feed_favicon as string) || '',
      title_zh: (r.title_zh as string) || '',
      summary_zh: truncate(r.summary_zh as string, SUMMARY_MAX_LEN),
    }));

    const responseData = { articles, total, page, limit };

    return NextResponse.json(
      { success: true, data: responseData },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
