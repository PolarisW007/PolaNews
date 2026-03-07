import { NextResponse } from 'next/server';
import { AVAILABLE_VOICES } from '@/lib/services/tts';

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: AVAILABLE_VOICES,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
