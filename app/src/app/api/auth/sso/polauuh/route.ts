import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { checkPolauuhSession } from '@/lib/aipd-sso';
import { generateToken } from '@/lib/auth';
import { query, queryOne } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  try {
    const session = await checkPolauuhSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'PolaUUH 登录态无效' }, { status: 401 });
    }
    if (!session.authorized) {
      return NextResponse.json({ success: false, error: '没有 PolaNews 权限，请先在 PolaUUH 申请。' }, { status: 403 });
    }

    const profile = session.user;
    if (!profile?.email) {
      return NextResponse.json({ success: false, error: 'PolaUUH 账户缺少邮箱' }, { status: 400 });
    }

    let user = await queryOne('SELECT * FROM users WHERE email = $1', [profile.email]);
    const displayName = profile.nickname || profile.username || profile.email;
    const avatarUrl = profile.avatar_url || '';
    const preferences = {
      language: 'zh',
      theme: profile.preferences?.theme || 'dark',
      font_family: profile.preferences?.font_family || 'system',
      font_scale: profile.preferences?.font_scale || 'normal',
      density: profile.preferences?.density || 'comfortable',
      digest_time: ['08:00'],
      categories: [],
    };

    if (!user) {
      const id = uuidv4();
      await query(
        'INSERT INTO users (id, email, password_hash, display_name, avatar_url, preferences) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, profile.email, '', displayName, avatarUrl, JSON.stringify(preferences)],
      );
      user = await queryOne('SELECT * FROM users WHERE id = $1', [id]);
    } else {
      await query(
        'UPDATE users SET display_name = COALESCE(NULLIF($1, \'\'), display_name), avatar_url = COALESCE(NULLIF($2, \'\'), avatar_url), last_login_at = NOW() WHERE id = $3',
        [displayName, avatarUrl, user.id],
      );
    }

    const token = generateToken(user!.id as string);
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user!.id,
          email: user!.email,
          display_name: displayName,
          avatar_url: avatarUrl || user!.avatar_url || '',
          preferences,
        },
        token,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
