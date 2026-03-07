import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const db = getDb();

    const article = db.prepare('SELECT id FROM articles WHERE id = ?').get(id);
    if (!article) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    const existing = db
      .prepare('SELECT id FROM user_article_states WHERE user_id = ? AND article_id = ?')
      .get(user.id, id) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        "UPDATE user_article_states SET is_read = 1, read_at = datetime('now') WHERE id = ?"
      ).run(existing.id);
    } else {
      db.prepare(
        "INSERT INTO user_article_states (id, user_id, article_id, is_read, read_at) VALUES (?, ?, ?, 1, datetime('now'))"
      ).run(uuidv4(), user.id, id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
