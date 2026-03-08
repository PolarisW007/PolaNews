import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';
import { parseJsonField } from '@/lib/db/helpers';

function rowToDigest(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    user_id: row.user_id as string | null,
    digest_date: row.digest_date as string,
    language: row.language as string,
    headlines: parseJsonField(row.headlines, []),
    category_summaries: parseJsonField(row.category_summaries, {}),
    statistics: parseJsonField(row.statistics, {}),
    trending_keywords: parseJsonField(row.trending_keywords, []),
    full_content: (row.full_content as string) || '',
    created_at: row.created_at as string,
  };
}

const digestCache = new Map<string, { data: unknown; ts: number }>();
const DIGEST_CACHE_TTL = 300_000;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get('lang') || 'zh';
    const date = searchParams.get('date');

    const cacheKey = `${lang}:${date || 'latest'}`;
    const cached = digestCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < DIGEST_CACHE_TTL) {
      return NextResponse.json(
        { success: true, data: cached.data },
        { headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' } },
      );
    }

    let row: Record<string, unknown> | null = null;
    if (date) {
      row = await queryOne(
        'SELECT * FROM daily_digests WHERE digest_date = $1 AND language = $2 LIMIT 1',
        [date, lang]
      ) as Record<string, unknown> | null;
      if (!row) {
        row = await queryOne(
          'SELECT * FROM daily_digests WHERE digest_date = $1 LIMIT 1',
          [date]
        ) as Record<string, unknown> | null;
      }
    } else {
      row = await queryOne(
        'SELECT * FROM daily_digests WHERE language = $1 ORDER BY digest_date DESC, created_at DESC LIMIT 1',
        [lang]
      ) as Record<string, unknown> | null;
    }

    const data = row ? rowToDigest(row) : null;
    digestCache.set(cacheKey, { data, ts: Date.now() });
    if (digestCache.size > 50) {
      const oldest = [...digestCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < 10; i++) digestCache.delete(oldest[i][0]);
    }

    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
