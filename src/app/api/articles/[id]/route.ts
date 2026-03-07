import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';
import { rowToArticle, ARTICLE_SELECT_FIELDS, ARTICLE_JOIN } from '@/lib/db/helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const db = getDb();
    const row = db
      .prepare(`SELECT ${ARTICLE_SELECT_FIELDS} ${ARTICLE_JOIN} WHERE a.id = ?`)
      .get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    const article = rowToArticle(row);
    return NextResponse.json({ success: true, data: article });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
