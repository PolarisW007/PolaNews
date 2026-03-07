import { NextRequest, NextResponse } from 'next/server';
import { getTopicTimeline } from '@/lib/services/trending';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ topic: string }> }
) {
  try {
    const { topic } = await params;
    const timeline = await getTopicTimeline(decodeURIComponent(topic));

    return NextResponse.json({
      success: true,
      data: timeline,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
