import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';
import { rowToArticle, ARTICLE_SELECT_FIELDS, ARTICLE_JOIN } from '@/lib/db/helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const row = await queryOne(
      `SELECT ${ARTICLE_SELECT_FIELDS} ${ARTICLE_JOIN} WHERE a.id = $1`,
      [id]
    );

    if (!row) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    const article = rowToArticle(row as Record<string, unknown>);
    return NextResponse.json({ success: true, data: article });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
