import { NextRequest, NextResponse } from 'next/server';
import { getSentimentTrend } from '@/lib/services/trending';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const topic = searchParams.get('topic');
    const days = parseInt(searchParams.get('days') || '30', 10);

    if (!topic) {
      return NextResponse.json(
        { success: false, error: '缺少 topic 参数' },
        { status: 400 }
      );
    }

    const sentiment = await getSentimentTrend(topic, days);

    return NextResponse.json({
      success: true,
      data: sentiment,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
