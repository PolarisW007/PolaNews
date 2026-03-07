import { NextRequest, NextResponse } from 'next/server';
import { translateUntranslatedArticles } from '@/lib/rss/engine';
import { getDb } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(200, Math.max(1, body.limit || 50));

    const db = getDb();
    const { untranslated } = db.prepare(
      "SELECT COUNT(*) as untranslated FROM articles WHERE title_zh IS NULL OR title_zh = ''"
    ).get() as { untranslated: number };

    translateUntranslatedArticles(limit).catch(e =>
      console.error('Background translation failed:', e)
    );

    return NextResponse.json({
      success: true,
      data: { untranslated, translating: true, batch_size: Math.min(limit, untranslated) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const db = getDb();
    const { untranslated } = db.prepare(
      "SELECT COUNT(*) as untranslated FROM articles WHERE title_zh IS NULL OR title_zh = ''"
    ).get() as { untranslated: number };
    const { total } = db.prepare(
      "SELECT COUNT(*) as total FROM articles"
    ).get() as { total: number };

    return NextResponse.json({
      success: true,
      data: { total, untranslated, translated: total - untranslated },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
