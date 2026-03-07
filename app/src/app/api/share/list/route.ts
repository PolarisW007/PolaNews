import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const platform = searchParams.get('platform') || '';
    const offset = (page - 1) * limit;

    let countSql = 'SELECT COUNT(*) as c FROM social_shares';
    let listSql = 'SELECT * FROM social_shares';
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (platform) {
      countSql += ` WHERE platform = $${paramIdx}`;
      listSql += ` WHERE platform = $${paramIdx}`;
      params.push(platform);
      paramIdx++;
    }

    listSql += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;

    const totalResult = await queryOne(countSql, params) as { c: number | string };
    const shares = await query(listSql, [...params, limit, offset]);

    return NextResponse.json({
      success: true,
      data: { shares, total: Number(totalResult.c), page, limit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
