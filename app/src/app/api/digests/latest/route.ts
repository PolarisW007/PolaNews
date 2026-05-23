import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';
import { parseJsonField } from '@/lib/db/helpers';
import { getDigestCache, setDigestCache, DIGEST_CACHE_TTL } from '@/lib/services/digest-cache';

function normalizeDateField(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // 已经是 YYYY-MM-DD 就直接返回
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function extractTitleFromContent(content: string): string {
  if (!content) return '';
  const line = content.split('\n').map((l) => l.trim()).find((l) => /^#\s+/.test(l));
  return line ? line.replace(/^#\s+/, '').trim() : '';
}

function rowToDigest(row: Record<string, unknown>) {
  const headlines = parseJsonField<Array<{ title?: string }>>(row.headlines, []);
  const statistics = parseJsonField<{ total_articles?: number }>(row.statistics, {});
  const full_content = (row.full_content as string) || '';
  const date = normalizeDateField(row.digest_date);
  const fallbackTitle = extractTitleFromContent(full_content)
    || (headlines[0]?.title as string | undefined)
    || '';
  return {
    id: row.id as string,
    user_id: row.user_id as string | null,
    digest_date: date,
    date, // 首页 UI 兼容
    title: fallbackTitle,
    headline_count: Array.isArray(headlines) ? headlines.length : 0,
    total_articles: statistics?.total_articles ?? 0,
    language: row.language as string,
    headlines,
    category_summaries: parseJsonField(row.category_summaries, {}),
    statistics,
    trending_keywords: parseJsonField(row.trending_keywords, []),
    full_content,
    created_at: row.created_at as string,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get('lang') || 'zh';
    const date = searchParams.get('date');

    const cacheKey = `${lang}:${date || 'latest'}`;
    const cached = getDigestCache(cacheKey);
    const cachedData = cached?.data as { digest_date?: string } | null | undefined;
    if (
      cached &&
      Date.now() - cached.ts < DIGEST_CACHE_TTL &&
      (!date || cachedData?.digest_date === date)
    ) {
      return NextResponse.json(
        { success: true, data: cached.data },
        { headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' } },
      );
    }

    let row: Record<string, unknown> | null = null;
    if (date) {
      row = await queryOne(
        'SELECT * FROM daily_digests WHERE digest_date = $1 AND language = $2 ORDER BY created_at DESC LIMIT 1',
        [date, lang]
      ) as Record<string, unknown> | null;
      if (!row) {
        row = await queryOne(
          'SELECT * FROM daily_digests WHERE digest_date = $1 ORDER BY created_at DESC LIMIT 1',
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
    setDigestCache(cacheKey, data);

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
