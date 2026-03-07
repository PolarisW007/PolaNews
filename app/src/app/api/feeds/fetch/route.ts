import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';
import { fetchAllFeeds, translateUntranslatedArticles, classifyUnclassifiedArticles } from '@/lib/rss/engine';

export async function POST(_req: NextRequest) {
  try {
    await fetchAllFeeds();

    const feedCount = await queryOne('SELECT COUNT(*) as count FROM feeds') as { count: number | string };
    const articleCount = await queryOne('SELECT COUNT(*) as count FROM articles') as { count: number | string };

    translateUntranslatedArticles(50).catch(e =>
      console.error('Background translation failed:', e)
    );
    classifyUnclassifiedArticles(30).catch(e =>
      console.error('Background classification failed:', e)
    );

    return NextResponse.json({
      success: true,
      data: {
        feeds_count: Number(feedCount.count),
        articles_count: Number(articleCount.count),
        translating: true,
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
