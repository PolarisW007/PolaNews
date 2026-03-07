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
        'SELECT COUNT(*) as total FROM user_article_states WHERE user_id = ? AND is_saved = 1'
      )
      .get(user.id) as { total: number };

    const rows = db
      .prepare(
        `SELECT ${USER_STATE_SELECT} ${USER_STATE_JOIN}
         WHERE s.user_id = ? AND s.is_saved = 1
         ORDER BY a.published_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(user.id, limit, offset) as Record<string, unknown>[];

    const articles = rows.map(r => rowToArticle(r, { is_saved: true }));

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

export async function DELETE(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }
    const { article_id } = await req.json();
    if (!article_id) {
      return NextResponse.json({ success: false, error: '缺少 article_id' }, { status: 400 });
    }
    const db = getDb();
    db.prepare('UPDATE user_article_states SET is_saved = 0 WHERE user_id = ? AND article_id = ?')
      .run(user.id, article_id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
