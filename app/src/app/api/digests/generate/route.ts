import { NextRequest, NextResponse } from 'next/server';
import { generateDailyDigest } from '@/lib/services/digest';

export async function POST(req: NextRequest) {
  try {
    let lang = 'zh';
    try {
      const body = await req.json();
      if (body?.lang) {
        lang = String(body.lang);
      }
    } catch {
      // 无 body 时使用默认 lang
    }

    const digest = await generateDailyDigest(lang);

    return NextResponse.json({
      success: true,
      data: digest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
