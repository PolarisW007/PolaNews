import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '@/lib/db/schema';
import { callLLM } from '@/lib/ai/llm';
import { generateBroadcastAudio } from '@/lib/services/tts';

type DigestHeadline = {
  title?: string;
  summary?: string;
  category?: string;
  importance?: string;
};

type DigestCategorySummaries = Record<string, {
  count?: number;
  items?: Array<{ title?: string; summary?: string }>;
}>;

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function isLikelyChinese(text: string): boolean {
  const compact = (text || '').replace(/\s/g, '');
  if (!compact) return false;
  const count = (compact.match(/[\u4e00-\u9fff]/g) || []).length;
  return count >= Math.min(12, compact.length * 0.2);
}

function cleanBroadcastText(text: string): string {
  return (text || '')
    .replace(/\*\*/g, '')
    .replace(/#+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFallbackScript(digest: Record<string, unknown>): string {
  const title = cleanBroadcastText(String(digest.title || '每日新闻播报'));
  const headlines = parseJsonField<DigestHeadline[]>(digest.headlines, []);
  const categorySummaries = parseJsonField<DigestCategorySummaries>(digest.category_summaries, {});
  const lines: string[] = [
    `[段落1] 各位听众朋友大家好，欢迎收听一念三千全球资讯播报。今天为你梳理 ${digest.digest_date || ''} 的重点新闻。`,
  ];

  headlines.slice(0, 3).forEach((item, idx) => {
    const itemTitle = cleanBroadcastText(item.title || `第 ${idx + 1} 条头条`);
    const summary = cleanBroadcastText(item.summary || '');
    lines.push(`[段落${idx + 2}] 第 ${idx + 1} 条，${itemTitle}。${summary.slice(0, 180)}`);
  });

  const categoryParts = Object.entries(categorySummaries)
    .slice(0, 4)
    .map(([category, group]) => {
      const first = group.items?.[0];
      const titleText = cleanBroadcastText(first?.title || '');
      return `${category} 方向共 ${group.count || group.items?.length || 0} 条，重点关注 ${titleText || '相关动态'}`;
    })
    .filter(Boolean);
  if (categoryParts.length > 0) {
    lines.push(`[段落${lines.length + 1}] 分类快讯方面，${categoryParts.join('；')}。`);
  }

  lines.push(`[段落${lines.length + 1}] 以上就是本次一念三千全球资讯播报。更多详情可以在每日 Digest 中继续阅读，我们下次再见。`);
  return lines.join('\n\n') || `[段落1] ${title}`;
}

function parseBroadcastSegments(script: string): { index: number; text: string }[] {
  const segments: { index: number; text: string }[] = [];
  const regex = /\[段落\s*(\d+)\]\s*([\s\S]*?)(?=\n?\s*\[段落\s*\d+\]|\s*$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(script)) !== null) {
    const index = Number(match[1]);
    const text = cleanBroadcastText(match[2] || '');
    if (Number.isFinite(index) && text.length > 3) {
      segments.push({ index, text });
    }
  }

  if (segments.length > 0) return segments;

  return script
    .split(/\n{2,}|(?<=。)\s+/)
    .map(cleanBroadcastText)
    .filter((text) => text.length > 8)
    .map((text, idx) => ({ index: idx + 1, text }));
}

export async function POST(req: NextRequest) {
  try {
    let lang = 'zh';
    let voice = 'longshu_v3';
    try {
      const body = await req.json();
      if (body?.lang) lang = String(body.lang);
      if (body?.voice) voice = String(body.voice);
    } catch {
      // use defaults
    }

    const digest = await queryOne(
      'SELECT * FROM daily_digests WHERE language = $1 ORDER BY digest_date DESC, created_at DESC LIMIT 1',
      [lang]
    ) as Record<string, unknown> | null;

    if (!digest) {
      return NextResponse.json(
        { success: false, error: '暂无可用的每日摘要，请先生成摘要' },
        { status: 404 }
      );
    }

    const fullContent = (digest.full_content as string) || '';
    const fallbackScript = buildFallbackScript(digest);

    const systemPrompt = `你是一位专业的中文新闻主播。请将以下新闻摘要改写为口语化的中文播报稿。

要求：
1. 开场白问候（例："各位听众朋友大家好，欢迎收听一念三千全球资讯播报。"）
2. 头条播报：3条最重要新闻，每条含标题朗读和100字以内AI摘要
3. 分类快讯：按分类播报要点
4. 结尾祝语
5. 必须全程使用简体中文，不要输出英文播报稿

格式要求：用 [段落1] [段落2] ... 标记每个段落，每段100-300字。`;

    const digestPreview = [
      `标题：${digest.title || ''}`,
      `日期：${digest.digest_date || ''}`,
      fallbackScript,
      fullContent.slice(0, 5000),
    ].join('\n\n');

    let script = await callLLM(digestPreview, systemPrompt);
    let segments = parseBroadcastSegments(script);

    if (!isLikelyChinese(script) || segments.length === 0) {
      script = fallbackScript;
      segments = parseBroadcastSegments(script);
    }

    const estimatedDuration = script.length * 120;
    const id = uuidv4();
    const broadcastDate = (digest.digest_date as string) || new Date().toISOString().slice(0, 10);

    await execute(
      `INSERT INTO broadcasts (id, digest_id, broadcast_date, language, script, segments, total_duration_ms, voice_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'generating')`,
      [id, digest.id as string, broadcastDate, lang, script, JSON.stringify(segments), estimatedDuration, voice]
    );

    generateBroadcastAudio(id).catch(err =>
      console.error('[Broadcast] 音频合成后台任务失败:', err)
    );

    const broadcast = await queryOne('SELECT * FROM broadcasts WHERE id = $1', [id]);

    return NextResponse.json({ success: true, data: broadcast });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
