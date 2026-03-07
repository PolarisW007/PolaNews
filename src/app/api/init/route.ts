import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';
import { seedPresetFeeds } from '@/lib/rss/presets';
import { fetchAllFeeds } from '@/lib/rss/engine';

export async function POST() {
  try {
    const db = getDb();
    seedPresetFeeds(db);

    const feedCount = (db.prepare('SELECT COUNT(*) as count FROM feeds').get() as { count: number }).count;
    const articleCount = (db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number }).count;

    return NextResponse.json({
      success: true,
      data: {
        message: '初始化完成',
        feeds: feedCount,
        articles: articleCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const db = getDb();
    seedPresetFeeds(db);

    await fetchAllFeeds();

    const feedCount = (db.prepare('SELECT COUNT(*) as count FROM feeds').get() as { count: number }).count;
    const articleCount = (db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number }).count;

    return NextResponse.json({
      success: true,
      data: {
        message: '初始化并抓取完成',
        feeds: feedCount,
        articles: articleCount,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Init error:', err.stack);
    return NextResponse.json(
      { success: false, error: err.message, stack: err.stack },
      { status: 500 }
    );
  }
}
