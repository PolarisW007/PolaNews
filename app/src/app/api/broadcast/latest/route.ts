import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get('lang') || 'zh';

    const broadcast = await queryOne(
      'SELECT * FROM broadcasts WHERE language = $1 ORDER BY created_at DESC LIMIT 1',
      [lang]
    );

    return NextResponse.json({
      success: true,
      data: broadcast ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
