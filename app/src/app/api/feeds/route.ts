import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import type { Feed } from '@/lib/types';

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

export async function GET() {
  try {
    const rows = await query(
      "SELECT * FROM feeds WHERE status != 'paused' ORDER BY category, title"
    );

    const feeds = rows.map(rowToFeed);
    return NextResponse.json({ success: true, data: feeds });
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
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未认证' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { url, title, category } = body;

    if (!url || !title || !category) {
      return NextResponse.json(
        { success: false, error: 'url、title、category 为必填项' },
        { status: 400 }
      );
    }

    const id = uuidv4();

    await execute(
      `INSERT INTO feeds (id, title, url, site_url, description, language, category, favicon_url,
        last_fetched_at, fetch_interval, etag, status, error_count, is_preset)
       VALUES ($1, $2, $3, '', '', 'en', $4, '', NULL, 30, '', 'active', 0, false)`,
      [id, title, url, category]
    );

    const row = await queryOne('SELECT * FROM feeds WHERE id = $1', [id]);
    const feed = rowToFeed(row as Record<string, unknown>);

    return NextResponse.json({ success: true, data: feed });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    if (message.includes('UNIQUE') || message.includes('url') || message.includes('duplicate key')) {
      return NextResponse.json(
        { success: false, error: '该 URL 已存在' },
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
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: '未认证' }, { status: 401 });
    }

    const body = await req.json();
    const { feed_id } = body;
    if (!feed_id) {
      return NextResponse.json({ success: false, error: '缺少 feed_id' }, { status: 400 });
    }

    const feed = await queryOne('SELECT id FROM feeds WHERE id = $1', [feed_id]);
    if (!feed) {
      return NextResponse.json({ success: false, error: '订阅源不存在' }, { status: 404 });
    }

    await execute('DELETE FROM articles WHERE feed_id = $1', [feed_id]);
    await execute('DELETE FROM user_subscriptions WHERE feed_id = $1', [feed_id]);
    await execute('DELETE FROM feeds WHERE id = $1', [feed_id]);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
