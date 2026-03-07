import { NextRequest, NextResponse } from 'next/server';
import { fetchAndStoreFullContent } from '@/lib/services/readability';
import { queryOne } from '@/lib/db/schema';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await fetchAndStoreFullContent(id);

    if (!success) {
      return NextResponse.json(
        { success: false, error: '无法抓取全文内容' },
        { status: 400 }
      );
    }

    const article = await queryOne(
      'SELECT id, title, content, full_content FROM articles WHERE id = $1',
      [id]
    );

    return NextResponse.json({
      success: true,
      data: {
        id,
        content: (article as Record<string, unknown>)?.full_content || (article as Record<string, unknown>)?.content || '',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
