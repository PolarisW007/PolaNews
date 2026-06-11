import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { getAipdPreferences, updateAipdPreferences } from '@/lib/aipd-sso';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const unified = await getAipdPreferences(req);

    return NextResponse.json({
      success: true,
      data: {
        display_name: user.display_name,
        email: user.email,
        language: user.preferences?.language || 'zh',
        digest_language: user.preferences?.digest_language || user.preferences?.language || 'zh',
        theme: unified.theme || user.preferences?.theme || 'dark',
        font_family: unified.font_family || user.preferences?.font_family || 'system',
        font_scale: unified.font_scale || user.preferences?.font_scale || 'normal',
        density: unified.density || user.preferences?.density || 'comfortable',
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

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
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

    const {
      display_name,
      email,
      language,
      digest_language,
      theme,
      font_family,
      font_scale,
      density,
      digest_times,
      followed_categories,
    } = body;

    if (display_name !== undefined || email !== undefined) {
      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (display_name !== undefined) {
        updates.push(`display_name = $${paramIdx++}`);
        params.push(display_name);
      }
      if (email !== undefined) {
        updates.push(`email = $${paramIdx++}`);
        params.push(email);
      }

      if (updates.length > 0) {
        params.push(user.id);
        await execute(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
          params
        );
      }
    }

    const merged = {
      ...user.preferences,
      ...(language !== undefined && { language }),
      ...(digest_language !== undefined && { digest_language }),
      ...(digest_times !== undefined && { digest_time: digest_times }),
      ...(followed_categories !== undefined && { categories: followed_categories }),
    };

    await execute('UPDATE users SET preferences = $1 WHERE id = $2', [
      JSON.stringify(merged),
      user.id,
    ]);

    const updatedAipdPreferences = await updateAipdPreferences(req, {
      ...(theme !== undefined && { theme }),
      ...(font_family !== undefined && { font_family }),
      ...(font_scale !== undefined && { font_scale }),
      ...(density !== undefined && { density }),
    });
    const unified = Object.keys(updatedAipdPreferences).length > 0
      ? updatedAipdPreferences
      : await getAipdPreferences(req);
    const updatedUser = await queryOne('SELECT * FROM users WHERE id = $1', [user.id]);

    return NextResponse.json({
      success: true,
      data: {
        display_name: (updatedUser?.display_name as string) || user.display_name,
        email: (updatedUser?.email as string) || user.email,
        language: merged.language || 'zh',
        digest_language: merged.digest_language || merged.language || 'zh',
        theme: unified.theme || merged.theme || 'dark',
        font_family: unified.font_family || merged.font_family || 'system',
        font_scale: unified.font_scale || merged.font_scale || 'normal',
        density: unified.density || merged.density || 'comfortable',
        digest_times: merged.digest_time || ['08:00'],
        followed_categories: merged.categories || [],
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
