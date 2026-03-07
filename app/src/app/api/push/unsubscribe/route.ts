import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { execute } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const { endpoint } = await req.json();

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: '缺少 endpoint 参数' },
        { status: 400 }
      );
    }

    await execute(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [user.id, endpoint]
    );

    return NextResponse.json({
      success: true,
      data: { unsubscribed: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
