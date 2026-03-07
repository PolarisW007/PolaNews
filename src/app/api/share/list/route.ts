import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const platform = searchParams.get('platform') || '';
    const offset = (page - 1) * limit;

    const db = getDb();

    let countSql = 'SELECT COUNT(*) as c FROM social_shares';
    let listSql = 'SELECT * FROM social_shares';
    const params: (string | number)[] = [];

    if (platform) {
      countSql += ' WHERE platform = ?';
      listSql += ' WHERE platform = ?';
      params.push(platform);
    }

    listSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

    const total = db.prepare(countSql).get(...params) as { c: number };
    const shares = db.prepare(listSql).all(...params, limit, offset);

    return NextResponse.json({
      success: true,
      data: { shares, total: total.c, page, limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
