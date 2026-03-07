import { NextRequest, NextResponse } from 'next/server';
import { createUser, generateToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, display_name } = body;

    if (!email || !password || !display_name) {
      return NextResponse.json(
        { success: false, error: '邮箱、密码和显示名称为必填项' },
        { status: 400 }
      );
    }

    const user = await createUser(email, password, display_name);
    const token = generateToken(user.id);

    return NextResponse.json({
      success: true,
      data: { user, token },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    if (message.includes('UNIQUE') || message.includes('email') || message.includes('duplicate key')) {
      return NextResponse.json(
        { success: false, error: '该邮箱已被注册' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
