import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get('lang') || 'zh';

    const db = getDb();
    const broadcast = db
      .prepare(
        `SELECT * FROM broadcasts WHERE language = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(lang) as Record<string, unknown> | undefined;

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
