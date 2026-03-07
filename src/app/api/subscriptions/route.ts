import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import type { Feed, UserSubscription } from '@/lib/types';

function rowToFeed(row: Record<string, unknown>): Feed {
  return {
    id: row.id as string,
    title: row.title as string,
    url: row.url as string,
    site_url: (row.site_url as string) || '',
    description: (row.description as string) || '',
    language: (row.language as string) || 'en',
    category: (row.category as string) || 'general',
    favicon_url: (row.favicon_url as string) || '',
    last_fetched_at: (row.last_fetched_at as string) || null,
    fetch_interval: (row.fetch_interval as number) ?? 30,
    etag: (row.etag as string) || '',
    status: (row.status as 'active' | 'error' | 'paused') || 'active',
    error_count: (row.error_count as number) ?? 0,
    is_preset: Boolean(row.is_preset),
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未认证' },
        { status: 401 }
      );
    }

    const db = getDb();
    const rows = db
      .prepare(
        `SELECT us.*, f.id as fid, f.title, f.url, f.site_url, f.description, f.language,
          f.category, f.favicon_url, f.last_fetched_at, f.fetch_interval, f.etag,
          f.status, f.error_count, f.is_preset
         FROM user_subscriptions us
         INNER JOIN feeds f ON us.feed_id = f.id
         WHERE us.user_id = ?
         ORDER BY us.group_name, us.created_at DESC`
      )
      .all(user.id) as Record<string, unknown>[];

    const subscriptions: UserSubscription[] = rows.map((row) => ({
      id: row.id as string,
      user_id: row.user_id as string,
      feed_id: row.feed_id as string,
      custom_label: (row.custom_label as string) || '',
      group_name: (row.group_name as string) || '',
      created_at: row.created_at as string,
      feed: rowToFeed({
        id: row.fid,
        title: row.title,
        url: row.url,
        site_url: row.site_url,
        description: row.description,
        language: row.language,
        category: row.category,
        favicon_url: row.favicon_url,
        last_fetched_at: row.last_fetched_at,
        fetch_interval: row.fetch_interval,
        etag: row.etag,
        status: row.status,
        error_count: row.error_count,
        is_preset: row.is_preset,
      }),
    }));

    return NextResponse.json({ success: true, data: subscriptions });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未认证' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { feed_id, group_name, custom_label } = body;

    if (!feed_id) {
      return NextResponse.json(
        { success: false, error: 'feed_id 为必填项' },
        { status: 400 }
      );
    }

    const db = getDb();
    const id = uuidv4();

    db.prepare(
      `INSERT INTO user_subscriptions (id, user_id, feed_id, custom_label, group_name)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      feed_id,
      custom_label || '',
      group_name || ''
    );

    const row = db
      .prepare(
        `SELECT us.*, f.id as fid, f.title, f.url, f.site_url, f.description, f.language,
          f.category, f.favicon_url, f.last_fetched_at, f.fetch_interval, f.etag,
          f.status, f.error_count, f.is_preset
         FROM user_subscriptions us
         INNER JOIN feeds f ON us.feed_id = f.id
         WHERE us.id = ?`
      )
      .get(id) as Record<string, unknown>;

    const subscription: UserSubscription = {
      id: row.id as string,
      user_id: row.user_id as string,
      feed_id: row.feed_id as string,
      custom_label: (row.custom_label as string) || '',
      group_name: (row.group_name as string) || '',
      created_at: row.created_at as string,
      feed: rowToFeed({
        id: row.fid,
        title: row.title,
        url: row.url,
        site_url: row.site_url,
        description: row.description,
        language: row.language,
        category: row.category,
        favicon_url: row.favicon_url,
        last_fetched_at: row.last_fetched_at,
        fetch_interval: row.fetch_interval,
        etag: row.etag,
        status: row.status,
        error_count: row.error_count,
        is_preset: row.is_preset,
      }),
    };

    return NextResponse.json({ success: true, data: subscription });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    if (message.includes('UNIQUE') || message.includes('user_id') || message.includes('feed_id')) {
      return NextResponse.json(
        { success: false, error: '您已订阅该 feed' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未认证' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { subscription_id } = body;

    if (!subscription_id) {
      return NextResponse.json(
        { success: false, error: 'subscription_id 为必填项' },
        { status: 400 }
      );
    }

    const db = getDb();
    const result = db
      .prepare('DELETE FROM user_subscriptions WHERE id = ? AND user_id = ?')
      .run(subscription_id, user.id);

    if (result.changes === 0) {
      return NextResponse.json(
        { success: false, error: '订阅不存在或无权操作' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
