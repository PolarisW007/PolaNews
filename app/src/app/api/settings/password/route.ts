import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifyToken } from '@/lib/auth';
import { queryOne, execute } from '@/lib/db/schema';

export async function PUT(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  const user = verifyToken(token);
  if (!user) {
    return NextResponse.json({ success: false, error: '未授权' }, { status: 401 });
  }

  try {
    const { old_password, new_password } = await request.json();

    if (!old_password || !new_password) {
      return NextResponse.json({ success: false, error: '请提供旧密码和新密码' }, { status: 400 });
    }

    if (new_password.length < 6) {
      return NextResponse.json({ success: false, error: '新密码至少需要 6 位' }, { status: 400 });
    }

    const dbUser = await queryOne('SELECT id, password_hash FROM users WHERE id = $1', [user.userId]) as { id: string; password_hash: string } | null;
    if (!dbUser) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    }

    const isValid = await bcrypt.compare(old_password, dbUser.password_hash);
    if (!isValid) {
      return NextResponse.json({ success: false, error: '当前密码错误' }, { status: 400 });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await execute('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, user.userId]);

    return NextResponse.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('Password change error:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
