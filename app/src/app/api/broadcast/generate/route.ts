import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '@/lib/db/schema';
import { callLLM } from '@/lib/ai/llm';
import { generateBroadcastAudio } from '@/lib/services/tts';

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

    const systemPrompt = `你是一位专业的新闻主播。请将以下新闻摘要改写为口语化的播报稿。

要求：
1. 开场白问候（例："各位听众朋友大家好，欢迎收听一念三千全球资讯播报。"）
2. 头条播报：3条最重要新闻，每条含标题朗读和100字以内AI摘要
3. 分类快讯：按分类播报要点
4. 结尾祝语

格式要求：用 [段落1] [段落2] ... 标记每个段落，每段100-300字。`;

    const digestPreview = fullContent.slice(0, 6000);
    const script = await callLLM(digestPreview, systemPrompt);

    const segmentRegex = /\[段落(\d+)\]\s*/g;
    const parts = script.split(segmentRegex).filter(Boolean);
    const segments: { index: number; text: string }[] = [];

    for (let i = 0; i < parts.length; i += 2) {
      const idx = parseInt(parts[i], 10);
      const text = (parts[i + 1] || '').trim();
      if (text && !isNaN(idx)) {
        segments.push({ index: idx, text });
      }
    }

    if (segments.length === 0 && script.trim()) {
      const lines = script.split('\n\n').filter(l => l.trim().length > 10);
      lines.forEach((text, i) => {
        segments.push({ index: i + 1, text: text.trim() });
      });
    }

    if (segments.length === 0) {
      segments.push({ index: 1, text: script.trim() || '暂无播报内容' });
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
