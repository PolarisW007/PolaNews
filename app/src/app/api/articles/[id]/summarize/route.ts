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
      'SELECT id, title, content, summary FROM articles WHERE id = $1',
      [id]
    ) as { id: string; title: string; content: string; summary: string } | null;

    if (!article) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    const { summary, key_points } = await summarizeArticle(
      article.title,
      article.content || article.summary || '',
      lang
    );

    const aiSummaryCol = lang === 'zh' ? 'ai_summary' : lang === 'en' ? 'ai_summary_en' : 'ai_summary_ja';
    await execute(
      `UPDATE articles SET ${aiSummaryCol} = $1, ai_key_points = $2 WHERE id = $3`,
      [summary, JSON.stringify(key_points), id]
    );

    return NextResponse.json({
      success: true,
      data: { summary, key_points },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
