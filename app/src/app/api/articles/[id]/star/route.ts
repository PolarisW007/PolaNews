import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const article = await queryOne('SELECT id FROM articles WHERE id = $1', [id]);
    if (!article) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    const existing = await queryOne(
      'SELECT id, is_starred FROM user_article_states WHERE user_id = $1 AND article_id = $2',
      [user.id, id]
    ) as { id: string; is_starred: boolean } | null;

    let isStarred: boolean;

    if (existing) {
      const newVal = !existing.is_starred;
      await execute('UPDATE user_article_states SET is_starred = $1 WHERE id = $2', [newVal, existing.id]);
      isStarred = newVal;
    } else {
      await execute(
        'INSERT INTO user_article_states (id, user_id, article_id, is_starred) VALUES ($1, $2, $3, true)',
        [uuidv4(), user.id, id]
      );
      isStarred = true;
    }

    return NextResponse.json({ success: true, data: { is_starred: isStarred } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
