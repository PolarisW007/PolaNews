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
      .prepare('SELECT id, is_saved FROM user_article_states WHERE user_id = ? AND article_id = ?')
      .get(user.id, id) as { id: string; is_saved: number } | undefined;

    let isSaved: boolean;

    if (existing) {
      const newVal = 1 - existing.is_saved;
      db.prepare('UPDATE user_article_states SET is_saved = ? WHERE id = ?').run(newVal, existing.id);
      isSaved = newVal === 1;
    } else {
      db.prepare(
        'INSERT INTO user_article_states (id, user_id, article_id, is_saved) VALUES (?, ?, ?, 1)'
      ).run(uuidv4(), user.id, id);
      isSaved = true;
    }

    return NextResponse.json({ success: true, data: { is_saved: isSaved } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
