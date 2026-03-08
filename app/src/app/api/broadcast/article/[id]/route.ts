import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';
import { synthesizeAudio } from '@/lib/services/tts';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const article = await queryOne(
      'SELECT id, title, content, full_content, summary, ai_summary FROM articles WHERE id = $1',
      [id]
    ) as Record<string, string> | null;

    if (!article) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    const rawText = article.ai_summary || article.summary ||
      (article.full_content || article.content || '').replace(/<[^>]*>/g, '') ||
      article.title;
    const text = rawText.replace(/<[^>]*>/g, '').slice(0, 500);

    if (!text.trim()) {
      return NextResponse.json(
        { success: false, error: '文章无可朗读内容' },
        { status: 400 }
      );
    }

    let voice = 'longshu_v3';
    try {
      const body = await _req.json();
      if (body?.voice) voice = String(body.voice);
    } catch { /* use default */ }

    const result = await synthesizeAudio(text.trim(), voice);
    if (!result) {
      return NextResponse.json(
        { success: false, error: '语音合成失败' },
        { status: 500 }
      );
    }

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    return NextResponse.json({
      success: true,
      data: {
        url: `${basePath}/api/tts/audio/${result.filename}`,
        filename: result.filename,
        article_id: id,
        title: article.title,
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
