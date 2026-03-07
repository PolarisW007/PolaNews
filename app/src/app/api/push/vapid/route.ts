import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/services/push';

export async function GET() {
  try {
    const publicKey = getVapidPublicKey();

    return NextResponse.json({
      success: true,
      data: { publicKey },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
