import { NextRequest, NextResponse } from 'next/server';
import { fetchAndStoreFullContent } from '@/lib/services/readability';
import { queryOne } from '@/lib/db/schema';

type Article = Record<string, unknown>;

/** GET: 先返回已存储全文，若无则自动触发抓取 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const article = await queryOne(
      'SELECT id, title, content, full_content, url FROM articles WHERE id = $1',
      [id]
    ) as Article | null;

    if (!article) {
      return NextResponse.json({ success: false, error: '文章不存在' }, { status: 404 });
    }

    // 已有全文直接返回
    if (article.full_content) {
      return NextResponse.json({
        success: true,
        data: { id, content: article.full_content, url: article.url },
      });
    }

    // 没有全文则尝试抓取
    const success = await fetchAndStoreFullContent(id);
    const updated = success
      ? await queryOne('SELECT full_content, content, url FROM articles WHERE id = $1', [id]) as Article | null
      : null;

    return NextResponse.json({
      success: true,
      data: {
        id,
        content: (updated?.full_content || article.content || '') as string,
        url: article.url,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** POST: 强制重新抓取全文 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await fetchAndStoreFullContent(id);

    if (!success) {
      return NextResponse.json(
        { success: false, error: '无法抓取全文内容' },
        { status: 400 }
      );
    }

    const article = await queryOne(
      'SELECT id, title, content, full_content, url FROM articles WHERE id = $1',
      [id]
    ) as Article | null;

    return NextResponse.json({
      success: true,
      data: {
        id,
        content: (article?.full_content || article?.content || '') as string,
        url: article?.url,
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
