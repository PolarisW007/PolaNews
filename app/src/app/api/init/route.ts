import { NextResponse } from 'next/server';
import { queryOne, initializeDatabase } from '@/lib/db/schema';
import { seedPresetFeeds } from '@/lib/rss/presets';
import { runFullIngest } from '@/lib/rss/engine';

export async function POST() {
  try {
    await initializeDatabase();
    await seedPresetFeeds();

    const feedCount = await queryOne('SELECT COUNT(*) as count FROM feeds') as { count: number | string };
    const articleCount = await queryOne('SELECT COUNT(*) as count FROM articles') as { count: number | string };

    return NextResponse.json({
      success: true,
      data: {
        message: '初始化完成',
        feeds: Number(feedCount.count),
        articles: Number(articleCount.count),
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
    await initializeDatabase();
    await seedPresetFeeds();

    const pipelineResult = await runFullIngest();

    const feedCount = await queryOne('SELECT COUNT(*) as count FROM feeds') as { count: number | string };
    const articleCount = await queryOne('SELECT COUNT(*) as count FROM articles') as { count: number | string };

    return NextResponse.json({
      success: true,
      data: {
        message: '初始化并抓取完成',
        feeds: Number(feedCount.count),
        articles: Number(articleCount.count),
        translated: pipelineResult.translated,
        summarized: pipelineResult.summarized,
        audio_synthesized: pipelineResult.audio_synthesized,
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
