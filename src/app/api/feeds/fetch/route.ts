import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';
import { fetchAllFeeds, translateUntranslatedArticles, classifyUnclassifiedArticles } from '@/lib/rss/engine';

export async function POST(_req: NextRequest) {
  try {
    await fetchAllFeeds();

    const db = getDb();
    const feedCount = (db.prepare('SELECT COUNT(*) as count FROM feeds').get() as { count: number }).count;
    const articleCount = (db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number }).count;

    translateUntranslatedArticles(50).catch(e =>
      console.error('Background translation failed:', e)
    );
    classifyUnclassifiedArticles(30).catch(e =>
      console.error('Background classification failed:', e)
    );

    return NextResponse.json({
      success: true,
      data: {
        feeds_count: feedCount,
        articles_count: articleCount,
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
