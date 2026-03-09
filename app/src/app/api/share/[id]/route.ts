import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const share = await queryOne(
      `SELECT s.*, a.title as article_title, a.url as article_url, a.cover_image as article_cover
       FROM social_shares s
       LEFT JOIN articles a ON s.article_id = a.id
       WHERE s.id = $1`,
      [id]
    );

    if (!share) {
      return NextResponse.json(
        { success: false, error: '分享不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: share,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
