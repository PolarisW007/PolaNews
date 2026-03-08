import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const broadcast = await queryOne(
      'SELECT * FROM broadcasts WHERE id = $1',
      [id]
    );

    if (!broadcast) {
      return NextResponse.json(
        { success: false, error: '播报不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: broadcast });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
