import { NextRequest, NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (process.env.POLANEWS_LOCAL_AUTH_ENABLED !== 'true') {
    return NextResponse.json(
      { success: false, error: 'PolaNews 已统一使用 PolaUUH 登录' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: '邮箱和密码为必填项' },
        { status: 400 }
      );
    }

    const result = await loginUser(email, password);

    if (!result) {
      return NextResponse.json(
        { success: false, error: '邮箱或密码错误' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { user: result.user, token: result.token },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
