import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';
import { runFullIngest } from '@/lib/rss/engine';
import { invalidateDigestCache } from '@/lib/services/digest-cache';

/**
 * 手动抓取：与 scheduler 同一条管道（抓取 → 翻译 → 分类 → 合成中文语音），
 * 保证前端点击"抓取"得到的增量处理结果和 2 小时定时任务一致。
 */
export async function POST(_req: NextRequest) {
  try {
    const pipelineResult = await runFullIngest();

    // 抓取 + 翻译之后让首页 Today's Digest 下次拉取时刷新
    invalidateDigestCache();

    const feedCount = await queryOne('SELECT COUNT(*) as count FROM feeds') as { count: number | string };
    const articleCount = await queryOne('SELECT COUNT(*) as count FROM articles') as { count: number | string };

    return NextResponse.json({
      success: true,
      data: {
        feeds_count: Number(feedCount.count),
        articles_count: Number(articleCount.count),
        translated: pipelineResult.translated,
        classified: pipelineResult.classified,
        audio_synthesized: pipelineResult.audio_synthesized,
        translating: false,
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
