import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const db = getDb();

    const total = db.prepare('SELECT COUNT(*) as c FROM broadcasts').get() as { c: number };
    const broadcasts = db
      .prepare('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset);

    return NextResponse.json({
      success: true,
      data: { broadcasts, total: total.c, page, limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
