import { NextRequest, NextResponse } from 'next/server';
import { synthesizeAudio } from '@/lib/services/tts';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice = 'longshu_v3' } = body as { text?: string; voice?: string };

    if (!text || !text.trim()) {
      return NextResponse.json(
        { success: false, error: '合成文本不能为空' },
        { status: 400 }
      );
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { success: false, error: '文本长度不能超过5000字' },
        { status: 400 }
      );
    }

    const result = await synthesizeAudio(text.trim(), voice);
    if (!result) {
      return NextResponse.json(
        { success: false, error: '语音合成服务暂不可用，请检查 DASHSCOPE_API_KEY 配置' },
        { status: 502 }
      );
    }

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    return NextResponse.json({
      success: true,
      data: {
        url: `${basePath}/api/tts/audio/${result.filename}`,
        filename: result.filename,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '语音合成失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
