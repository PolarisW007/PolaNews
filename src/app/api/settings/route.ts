import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { preferences: user.preferences },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: '无效的请求体' },
        { status: 400 }
      );
    }

    const merged = { ...user.preferences, ...body };
    const db = getDb();
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(
      JSON.stringify(merged),
      user.id
    );

    return NextResponse.json({
      success: true,
      data: { preferences: merged },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
