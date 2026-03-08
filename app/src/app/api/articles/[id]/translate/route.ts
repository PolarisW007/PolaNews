import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db/schema';
import { callLLM } from '@/lib/ai/llm';

interface TranslationParagraph {
  original: string;
  translated: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const row = await queryOne(
      'SELECT translation_zh FROM articles WHERE id = $1',
      [id]
    ) as { translation_zh: string } | null;

    if (!row) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    if (!row.translation_zh) {
      return NextResponse.json(
        { success: false, error: '暂无翻译缓存' },
        { status: 404 }
      );
    }

    let paragraphs: TranslationParagraph[];
    if (typeof row.translation_zh === 'string') {
      try { paragraphs = JSON.parse(row.translation_zh); } catch { paragraphs = []; }
    } else {
      paragraphs = row.translation_zh as unknown as TranslationParagraph[];
    }
    if (paragraphs.length === 0) {
      return NextResponse.json(
        { success: false, error: '暂无翻译缓存' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: { paragraphs } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const row = await queryOne(
      'SELECT id, title, content, full_content, summary, ai_summary, translation_zh FROM articles WHERE id = $1',
      [id]
    ) as { id: string; title: string; content: string; full_content: string; summary: string; ai_summary: string; translation_zh: unknown } | null;

    if (!row) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    if (row.translation_zh) {
      let paragraphs: TranslationParagraph[];
      if (typeof row.translation_zh === 'string') {
        try { paragraphs = JSON.parse(row.translation_zh); } catch { paragraphs = []; }
      } else {
        paragraphs = row.translation_zh as TranslationParagraph[];
      }
      if (paragraphs.length > 0) {
        return NextResponse.json({ success: true, data: { paragraphs } });
      }
    }

    const text = row.ai_summary || row.summary || row.full_content || row.content || row.title;
    const cleanText = text.replace(/<[^>]*>/g, '').slice(0, 3000);
    const rawParagraphs = cleanText
      .split(/\n{2,}|\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 5)
      .slice(0, 15);

    if (rawParagraphs.length === 0) {
      rawParagraphs.push(cleanText.trim() || row.title);
    }

    const prompt = `将以下英文段落翻译为中文。返回JSON数组，每个元素包含 "original"(原文) 和 "translated"(译文)。只返回JSON数组。

${rawParagraphs.map((p, i) => `[${i}] ${p}`).join('\n')}`;

    const systemPrompt = '你是专业翻译。只返回合法JSON数组，不要markdown围栏。';
    const result = await callLLM(prompt, systemPrompt);

    let paragraphs: TranslationParagraph[];
    try {
      const match = result.match(/\[[\s\S]*\]/);
      paragraphs = match ? JSON.parse(match[0]) : [];
    } catch {
      paragraphs = rawParagraphs.map((p) => ({ original: p, translated: p }));
    }

    if (paragraphs.length === 0) {
      paragraphs = rawParagraphs.map((p) => ({ original: p, translated: p }));
    }

    await execute('UPDATE articles SET translation_zh = $1 WHERE id = $2', [
      JSON.stringify(paragraphs),
      id,
    ]);

    return NextResponse.json({ success: true, data: { paragraphs } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
