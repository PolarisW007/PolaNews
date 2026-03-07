import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';

function parseJson<T>(val: unknown, fallback: T): T {
  if (!val || typeof val !== 'string') return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

function rowToDigest(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    user_id: row.user_id as string | null,
    digest_date: row.digest_date as string,
    language: row.language as string,
    headlines: parseJson(row.headlines, []),
    category_summaries: parseJson(row.category_summaries, {}),
    statistics: parseJson(row.statistics, {}),
    trending_keywords: parseJson(row.trending_keywords, []),
    full_content: (row.full_content as string) || '',
    created_at: row.created_at as string,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get('lang') || 'zh';
    const date = searchParams.get('date');

    const db = getDb();

    let row: Record<string, unknown> | undefined;
    if (date) {
      row = db
        .prepare('SELECT * FROM daily_digests WHERE digest_date = ? AND language = ? LIMIT 1')
        .get(date, lang) as Record<string, unknown> | undefined;
      if (!row) {
        row = db
          .prepare('SELECT * FROM daily_digests WHERE digest_date = ? LIMIT 1')
          .get(date) as Record<string, unknown> | undefined;
      }
    } else {
      row = db
        .prepare('SELECT * FROM daily_digests WHERE language = ? ORDER BY digest_date DESC, created_at DESC LIMIT 1')
        .get(lang) as Record<string, unknown> | undefined;
    }

    return NextResponse.json({
      success: true,
      data: row ? rowToDigest(row) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
