import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        display_name: user.display_name,
        email: user.email,
        language: user.preferences?.language || 'zh',
        digest_language: user.preferences?.digest_language || user.preferences?.language || 'zh',
        theme: user.preferences?.theme || 'dark',
        digest_times: user.preferences?.digest_time || ['08:00'],
        followed_categories: user.preferences?.categories || [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
