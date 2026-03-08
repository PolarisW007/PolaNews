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

    let parsed: unknown;
    if (typeof row.translation_zh === 'string') {
      try { parsed = JSON.parse(row.translation_zh); } catch { parsed = null; }
    } else {
      parsed = row.translation_zh;
    }

    // 新格式 { translated_html, paragraphs }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'translated_html' in (parsed as Record<string, unknown>)) {
      return NextResponse.json({ success: true, data: parsed });
    }

    // 旧格式：纯数组
    const paragraphs = Array.isArray(parsed) ? parsed as TranslationParagraph[] : [];
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
    const body = await req.json().catch(() => ({}));
    const mode = (body as { mode?: string }).mode;
    const sourceHtml = (body as { html?: string }).html;
    const force = (body as { force?: boolean }).force;

    // mode=html: 接收原始 HTML，返回翻译后 HTML（保留标签结构）
    if (mode === 'html' && sourceHtml) {
      return await translateHtml(id, sourceHtml, force);
    }

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
      let cached: unknown;
      if (typeof row.translation_zh === 'string') {
        try { cached = JSON.parse(row.translation_zh); } catch { cached = null; }
      } else {
        cached = row.translation_zh;
      }
      // 新格式：{ paragraphs, translated_html }
      if (cached && typeof cached === 'object' && 'translated_html' in (cached as Record<string, unknown>)) {
        return NextResponse.json({ success: true, data: cached });
      }
      // 旧格式：数组
      if (Array.isArray(cached) && cached.length > 0) {
        return NextResponse.json({ success: true, data: { paragraphs: cached } });
      }
    }

    // 优先使用完整正文，清洗后若太短则回退到 AI 摘要
    const rawText = row.full_content || row.content || '';
    const stripMeta = (t: string) => t.replace(/<[^>]*>/g, '')
      .replace(/Article URL:.*?\n?/g, '')
      .replace(/Comments URL:.*?\n?/g, '')
      .replace(/Points:\s*\d+\n?/g, '')
      .replace(/# Comments:\s*\d+\n?/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim();
    let cleanText = stripMeta(rawText);

    const isChinese = (t: string) => /[\u4e00-\u9fa5]/.test(t) && (t.match(/[\u4e00-\u9fa5]/g)?.length || 0) > t.length * 0.3;
    let useFallback = false;

    if (cleanText.length < 50) {
      if (row.ai_summary && isChinese(row.ai_summary)) {
        const paragraphs: TranslationParagraph[] = [{
          original: row.title,
          translated: row.ai_summary,
        }];
        await execute('UPDATE articles SET translation_zh = $1 WHERE id = $2', [
          JSON.stringify(paragraphs), id,
        ]);
        return NextResponse.json({ success: true, data: { paragraphs } });
      }
      cleanText = row.summary || row.title;
      useFallback = true;
    }

    cleanText = cleanText.slice(0, 8000);
    const rawParagraphs = cleanText
      .split(/\n{2,}|\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 10)
      .slice(0, 30);

    if (rawParagraphs.length === 0) {
      rawParagraphs.push(cleanText.trim() || row.title);
    }

    const prompt = useFallback
      ? `将以下英文内容翻译为中文。返回JSON数组，每个元素包含 "original"(英文原文) 和 "translated"(中文译文)。只返回JSON数组。\n\n${rawParagraphs.map((p, i) => `[${i}] ${p}`).join('\n')}`
      : `将以下英文段落逐段翻译为中文。返回JSON数组，每个元素包含 "original"(英文原文) 和 "translated"(中文译文)。保持原文段落顺序。只返回JSON数组，不要任何其他内容。\n\n${rawParagraphs.map((p, i) => `[${i}] ${p}`).join('\n')}`;

    const systemPrompt = '你是专业新闻翻译，翻译准确流畅，专业术语保留或使用通用译名。只返回合法JSON数组，不要markdown围栏。';
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

/**
 * HTML 模式翻译：保留 HTML 标签结构，只翻译文本节点
 * 将 HTML 中的纯文本提取出来分批翻译，然后回填到原始 HTML 结构中
 */
async function translateHtml(articleId: string, html: string, force?: boolean) {
  if (!force) {
    const cached = await queryOne(
      'SELECT translation_zh FROM articles WHERE id = $1', [articleId]
    ) as { translation_zh: string } | null;
    if (cached?.translation_zh) {
      try {
        const data = typeof cached.translation_zh === 'string'
          ? JSON.parse(cached.translation_zh) : cached.translation_zh;
        if (data && typeof data === 'object' && 'translated_html' in data) {
          return NextResponse.json({ success: true, data });
        }
      } catch { /* 无有效缓存 */ }
    }
  }

  // 提取文本节点：用正则将 HTML 拆分为标签和文本
  const parts = html.split(/(<[^>]+>)/g);
  const textSegments: { index: number; text: string }[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part.startsWith('<')) continue;
    const stripped = part.trim();
    if (stripped.length < 2) continue;
    textSegments.push({ index: i, text: stripped });
  }

  if (textSegments.length === 0) {
    return NextResponse.json({ success: true, data: { translated_html: html, paragraphs: [] } });
  }

  // 分批翻译（每批最多 30 段，共最多 6000 字符）
  const batchSize = 30;
  const translationMap = new Map<number, string>();

  for (let b = 0; b < textSegments.length; b += batchSize) {
    const batch = textSegments.slice(b, b + batchSize);
    const inputText = batch.map((s, i) => `[${i}] ${s.text}`).join('\n');

    const prompt = `将以下英文文本逐条翻译为中文。返回JSON数组，每个元素是一个字符串（翻译结果），按照输入顺序。只返回JSON数组，不要任何其他内容。\n\n${inputText}`;
    const systemPrompt = '你是专业新闻翻译。翻译准确、自然。只返回合法JSON字符串数组（如["译文1","译文2"]），不要markdown围栏。';

    const result = await callLLM(prompt, systemPrompt);
    try {
      const match = result.match(/\[[\s\S]*\]/);
      const translations: string[] = match ? JSON.parse(match[0]) : [];
      batch.forEach((seg, i) => {
        translationMap.set(seg.index, translations[i] || seg.text);
      });
    } catch {
      batch.forEach((seg) => translationMap.set(seg.index, seg.text));
    }
  }

  // 回填翻译到 HTML 结构中
  const translatedParts = parts.map((part, i) => {
    if (translationMap.has(i)) {
      // 保留原始空白，替换 trimmed 内容
      const original = part;
      const leadingSpace = original.match(/^(\s*)/)?.[1] || '';
      const trailingSpace = original.match(/(\s*)$/)?.[1] || '';
      return leadingSpace + translationMap.get(i) + trailingSpace;
    }
    return part;
  });
  const resultHtml = translatedParts.join('');

  // 同时构造 paragraphs 作为兼容数据
  const paragraphs = textSegments.map((seg) => ({
    original: seg.text,
    translated: translationMap.get(seg.index) || seg.text,
  }));

  const cacheData = { translated_html: resultHtml, paragraphs };
  await execute('UPDATE articles SET translation_zh = $1 WHERE id = $2', [
    JSON.stringify(cacheData), articleId,
  ]);

  return NextResponse.json({ success: true, data: cacheData });
}
