import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db/schema';
import { rowToArticle, ARTICLE_JOIN } from '@/lib/db/helpers';

const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_API_BASE = process.env.LLM_API_BASE || 'https://api.openai.com/v1';

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!LLM_API_KEY) return null;

  try {
    const res = await fetch(`${LLM_API_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { data?: Array<{ embedding?: number[] }> };
    return data.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));

    if (!q) {
      return NextResponse.json(
        { success: false, error: '缺少搜索关键词' },
        { status: 400 }
      );
    }

    const embedding = await getEmbedding(q);

    if (embedding) {
      const embeddingStr = `[${embedding.join(',')}]`;
      try {
        const rows = await query(
          `SELECT a.*, f.title as feed_title, f.favicon_url as feed_favicon,
                  1 - (a.embedding <=> $1::vector) as similarity
           ${ARTICLE_JOIN}
           WHERE a.embedding IS NOT NULL
           ORDER BY a.embedding <=> $1::vector
           LIMIT $2`,
          [embeddingStr, limit]
        );

        const articles = rows.map(r => ({
          ...rowToArticle(r as Record<string, unknown>),
          similarity: Number((r as Record<string, unknown>).similarity) || 0,
        }));

        return NextResponse.json({ success: true, data: { articles, total: articles.length, method: 'semantic' } });
      } catch {
        // pgvector not available, fall through to keyword search
      }
    }

    const likePattern = `%${q}%`;
    const rows = await query(
      `SELECT a.*, f.title as feed_title, f.favicon_url as feed_favicon
       ${ARTICLE_JOIN}
       WHERE a.title ILIKE $1 OR a.content ILIKE $1 OR a.title_zh ILIKE $1 OR a.summary ILIKE $1
       ORDER BY a.published_at DESC NULLS LAST
       LIMIT $2`,
      [likePattern, limit]
    );

    const articles = rows.map(r => rowToArticle(r as Record<string, unknown>));
    return NextResponse.json({ success: true, data: { articles, total: articles.length, method: 'keyword' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '搜索失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
