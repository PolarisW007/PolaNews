import { NextRequest, NextResponse } from 'next/server';
import { translateUntranslatedArticles } from '@/lib/rss/engine';
import { queryOne } from '@/lib/db/schema';

const UNTRANSLATED_WHERE = "title_zh IS NULL OR title_zh = '' OR (title_zh = title AND title !~ '[一-龥]')";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(200, Math.max(1, body.limit || 50));

    const result = await queryOne(
      `SELECT COUNT(*) as untranslated FROM articles WHERE ${UNTRANSLATED_WHERE}`
    ) as { untranslated: number | string };
    const untranslated = Number(result.untranslated);

    const translated = await translateUntranslatedArticles(limit);

    return NextResponse.json({
      success: true,
      data: {
        untranslated,
        translated,
        remaining: Math.max(0, untranslated - translated),
        translating: false,
        batch_size: Math.min(limit, untranslated),
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

export async function GET() {
  try {
    const untranslatedResult = await queryOne(
      `SELECT COUNT(*) as untranslated FROM articles WHERE ${UNTRANSLATED_WHERE}`
    ) as { untranslated: number | string };
    const totalResult = await queryOne(
      "SELECT COUNT(*) as total FROM articles"
    ) as { total: number | string };

    const untranslated = Number(untranslatedResult.untranslated);
    const total = Number(totalResult.total);

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
