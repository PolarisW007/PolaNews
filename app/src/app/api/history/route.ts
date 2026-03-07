import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { rowToArticle, USER_STATE_SELECT, USER_STATE_JOIN } from '@/lib/db/helpers';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const countResult = await queryOne(
      'SELECT COUNT(*) as total FROM user_article_states WHERE user_id = $1 AND is_read = true',
      [user.id]
    ) as { total: number | string };
    const total = Number(countResult.total);

    const rows = await query(
      `SELECT ${USER_STATE_SELECT} ${USER_STATE_JOIN}
       WHERE s.user_id = $1 AND s.is_read = true
       ORDER BY s.read_at DESC
       LIMIT $2 OFFSET $3`,
      [user.id, limit, offset]
    );

    const articles = rows.map(r => rowToArticle(r as Record<string, unknown>, { is_read: true }));

    return NextResponse.json({
      success: true,
      data: { articles, total },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
