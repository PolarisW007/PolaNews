import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const totalResult = await queryOne('SELECT COUNT(*) as c FROM daily_digests') as { c: number | string };
    const digests = await query(
      'SELECT * FROM daily_digests ORDER BY digest_date DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

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
