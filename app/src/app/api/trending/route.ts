import { NextResponse } from 'next/server';
import { query } from '@/lib/db/schema';
import { extractTrendingKeywords } from '@/lib/services/trending';

export async function GET() {
  try {
    const keywords = await extractTrendingKeywords();

    const rows = await query(
      `SELECT category, COUNT(*) as count FROM feeds WHERE status = 'active' GROUP BY category`
    );
    const categories = (rows as { category: string; count: number | string }[]).map(r => ({
      name: r.category,
      count: Number(r.count),
    }));

    return NextResponse.json({
      success: true,
      data: { keywords, categories },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
