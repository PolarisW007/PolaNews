import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { rowToArticle, USER_STATE_SELECT, USER_STATE_JOIN } from '@/lib/db/helpers';

export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
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

    const db = getDb();

    const { total } = db
      .prepare(
        'SELECT COUNT(*) as total FROM user_article_states WHERE user_id = ? AND is_read = 1'
      )
      .get(user.id) as { total: number };

    const rows = db
      .prepare(
        `SELECT ${USER_STATE_SELECT} ${USER_STATE_JOIN}
         WHERE s.user_id = ? AND s.is_read = 1
         ORDER BY s.read_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(user.id, limit, offset) as Record<string, unknown>[];

    const articles = rows.map(r => rowToArticle(r, { is_read: true }));

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
