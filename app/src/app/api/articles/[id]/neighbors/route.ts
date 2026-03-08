import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';

interface NeighborRow {
  id: string;
  title: string;
  title_zh: string;
  feed_title: string;
  published_at: string;
}

const neighborsCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 120_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const cached = neighborsCache.get(id);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(
        { success: true, data: cached.data },
        { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' } },
      );
    }

    const current = await queryOne(
      'SELECT published_at, created_at FROM articles WHERE id = $1',
      [id]
    ) as { published_at: string; created_at: string } | null;

    if (!current) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    const prev = await queryOne(
      `SELECT a.id, a.title, a.title_zh, f.title as feed_title, a.published_at
       FROM articles a INNER JOIN feeds f ON a.feed_id = f.id
       WHERE (a.published_at, a.created_at) > ($1, $2)
       ORDER BY a.published_at ASC, a.created_at ASC
       LIMIT 1`,
      [current.published_at, current.created_at]
    ) as NeighborRow | null;

    const next = await queryOne(
      `SELECT a.id, a.title, a.title_zh, f.title as feed_title, a.published_at
       FROM articles a INNER JOIN feeds f ON a.feed_id = f.id
       WHERE (a.published_at, a.created_at) < ($1, $2)
       ORDER BY a.published_at DESC, a.created_at DESC
       LIMIT 1`,
      [current.published_at, current.created_at]
    ) as NeighborRow | null;

    const toItem = (row: NeighborRow | null) =>
      row ? {
        id: row.id,
        title: row.title || '',
        title_zh: row.title_zh || '',
        feed_title: row.feed_title || '',
        published_at: row.published_at || '',
      } : null;

    const data = { prev: toItem(prev), next: toItem(next) };

    neighborsCache.set(id, { data, ts: Date.now() });
    if (neighborsCache.size > 500) {
      const oldest = [...neighborsCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < 100; i++) neighborsCache.delete(oldest[i][0]);
    }

    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
