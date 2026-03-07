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
      paragraphs = JSON.parse(row.translation_zh);
    } else {
      paragraphs = row.translation_zh as unknown as TranslationParagraph[];
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
      'SELECT id, title, content, translation_zh FROM articles WHERE id = $1',
      [id]
    ) as { id: string; title: string; content: string; translation_zh: unknown } | null;

    if (!row) {
      return NextResponse.json(
        { success: false, error: '文章不存在' },
        { status: 404 }
      );
    }

    if (row.translation_zh) {
      let paragraphs: TranslationParagraph[];
      if (typeof row.translation_zh === 'string') {
        paragraphs = JSON.parse(row.translation_zh);
      } else {
        paragraphs = row.translation_zh as TranslationParagraph[];
      }
      return NextResponse.json({ success: true, data: { paragraphs } });
    }

    const text = row.content || row.title;
    const rawParagraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const prompt = `Translate the following paragraphs from English to Chinese. Return a JSON array where each element has "original" (the original text) and "translated" (the Chinese translation). Only return the JSON array, no other text.

Paragraphs:
${rawParagraphs.map((p, i) => `[${i}] ${p}`).join('\n\n')}`;

    const systemPrompt = 'You are a professional translator. Return valid JSON only, no markdown fences.';
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
