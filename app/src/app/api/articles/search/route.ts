import { NextRequest, NextResponse } from 'next/server';
import { searchArticles, SearchUnavailableError } from '@/lib/services/article-search';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();

    if (!q || q.length > 2000) {
      return NextResponse.json(
        { success: false, error: !q ? '缺少搜索关键词' : '搜索关键词过长' },
        { status: 400 }
      );
    }

    const page = Number(searchParams.get('page') || '1');
    const requestedLimit = Number(searchParams.get('limit') || '20');
    const limit = Math.min(100, requestedLimit);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(requestedLimit)
      || requestedLimit < 1 || !Number.isSafeInteger((page - 1) * limit)) {
      return NextResponse.json({ success: false, error: '分页参数无效' }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: await searchArticles(q, page, limit) });
  } catch (err) {
    if (err instanceof SearchUnavailableError) {
      return NextResponse.json(
        { success: false, error: '搜索服务繁忙，请稍后重试' },
        { status: 503, headers: { 'Retry-After': '2' } },
      );
    }
    return NextResponse.json(
      { success: false, error: '搜索服务暂时不可用' },
      { status: 500 }
    );
  }
}
