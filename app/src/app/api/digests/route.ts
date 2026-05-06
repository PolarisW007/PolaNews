import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db/schema';

/** 把 PostgreSQL `date` 字段反序列化后的 JS Date 或 ISO 字符串统一归一化为 `YYYY-MM-DD`。 */
function normalizeDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const totalResult = await queryOne('SELECT COUNT(*) as c FROM daily_digests') as { c: number | string };
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM daily_digests ORDER BY digest_date DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    // 归一化 digest_date，避免前端拼 URL 时出现 "2026-05-04T16:00:00.000Z"
    const digests = rows.map((r) => ({
      ...r,
      digest_date: normalizeDate(r.digest_date),
    }));

    return NextResponse.json({
      success: true,
      data: { digests, total: Number(totalResult.c) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
