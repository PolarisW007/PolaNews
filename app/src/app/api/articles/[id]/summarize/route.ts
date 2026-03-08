import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db/schema';
import { summarizeArticle } from '@/lib/ai/llm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: '缺少文章 ID' },
        { status: 400 }
      );
    }

    let lang: 'zh' | 'en' | 'ja' = 'zh';
    try {
      const body = await req.json();
      if (body?.lang === 'en' || body?.lang === 'ja') {
        lang = body.lang;
      } else if (body?.lang === 'zh') {
        lang = 'zh';
      }
    } catch {
      // 使用默认 lang
    }

    const article = await queryOne(
      'SELECT id, title, content, summary, full_content FROM articles WHERE id = $1',
      [id]
    ) as { id: string; title: string; content: string; summary: string; full_content: string } | null;

    if (!article) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    const sourceText = (article.full_content || article.content || article.summary || '')
      .replace(/<[^>]*>/g, '')
      .replace(/Article URL:.*?\n/g, '')
      .replace(/Comments URL:.*?\n/g, '')
      .replace(/Points:\s*\d+\n?/g, '')
      .replace(/# Comments:\s*\d+\n?/g, '')
      .trim()
      .slice(0, 6000);

    const { summary, key_points } = await summarizeArticle(
      article.title,
      sourceText || article.title,
      lang
    );

    const aiSummaryCol = lang === 'zh' ? 'ai_summary' : lang === 'en' ? 'ai_summary_en' : 'ai_summary_ja';
    const keyPointsCol = lang === 'zh' ? 'ai_key_points' : lang === 'en' ? 'ai_key_points_en' : 'ai_key_points_ja';
    await execute(
      `UPDATE articles SET ${aiSummaryCol} = $1, ${keyPointsCol} = $2 WHERE id = $3`,
      [summary, JSON.stringify(key_points), id]
    );

    return NextResponse.json({
      success: true,
      data: {
        ai_summary: lang === 'zh' ? summary : undefined,
        ai_summary_en: lang === 'en' ? summary : undefined,
        ai_summary_ja: lang === 'ja' ? summary : undefined,
        ai_key_points: lang === 'zh' ? key_points : undefined,
        ai_key_points_en: lang === 'en' ? key_points : undefined,
        ai_key_points_ja: lang === 'ja' ? key_points : undefined,
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
