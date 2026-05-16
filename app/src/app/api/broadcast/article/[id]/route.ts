import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db/schema';
import { synthesizeAudio } from '@/lib/services/tts';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const article = await queryOne(
      'SELECT id, title, title_zh, content, full_content, summary, summary_zh, ai_summary, audio_url FROM articles WHERE id = $1',
      [id]
    ) as Record<string, string> | null;

    if (!article) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    let force = false;
    let voice = 'longshu_v3';
    try {
      const body = await _req.json();
      if (body?.voice) voice = String(body.voice);
      if (body?.force) force = Boolean(body.force);
    } catch { /* use default */ }

    // 如果后端 scheduler 已经为该文章预合成过语音且调用方没强制重生成，直接返回缓存的 audio_url
    if (!force && article.audio_url) {
      const filename = article.audio_url.split('/').pop() || '';
      return NextResponse.json({
        success: true,
        cached: true,
        data: {
          url: article.audio_url,
          filename,
          article_id: id,
          title: article.title_zh || article.title,
        },
      });
    }

    const rawText = article.title_zh
      ? `${article.title_zh}。${article.ai_summary || article.summary_zh || article.summary || ''}`
      : article.ai_summary || article.summary ||
        (article.full_content || article.content || '').replace(/<[^>]*>/g, '') ||
        article.title;
    const text = rawText.replace(/<[^>]*>/g, '').slice(0, 500);

    if (!text.trim()) {
      return NextResponse.json(
        { success: false, error: '文章无可朗读内容' },
        { status: 400 }
      );
    }

    const result = await synthesizeAudio(text.trim(), voice);
    if (!result) {
      return NextResponse.json(
        { success: false, error: '语音合成失败' },
        { status: 500 }
      );
    }

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const url = `${basePath}/api/tts/audio/${result.filename}`;

    // 持久化到 articles.audio_url，后续直接复用
    try {
      await execute(
        'UPDATE articles SET audio_url = $1, audio_voice = $2 WHERE id = $3',
        [url, voice, id]
      );
    } catch (e) {
      console.error('[Broadcast] failed to persist audio_url:', e);
    }

    return NextResponse.json({
      success: true,
      cached: false,
      data: {
        url,
        filename: result.filename,
        article_id: id,
        title: article.title_zh || article.title,
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
