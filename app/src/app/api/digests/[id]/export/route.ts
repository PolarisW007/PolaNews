import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/schema';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'markdown';

    const digest = await queryOne(
      'SELECT * FROM daily_digests WHERE id = $1',
      [id]
    ) as Record<string, unknown> | null;

    if (!digest) {
      return NextResponse.json(
        { success: false, error: 'Digest 不存在' },
        { status: 404 }
      );
    }

    const content = (digest.full_content as string) || '';
    const date = String(digest.digest_date || '');

    if (format === 'pdf') {
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${date} 每日资讯摘要</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; line-height: 1.8; }
h1 { color: #00C853; border-bottom: 2px solid #00C853; padding-bottom: 10px; }
h2 { color: #00897B; margin-top: 30px; }
h3 { color: #444; }
ul { padding-left: 20px; }
li { margin-bottom: 8px; }
.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
</style></head>
<body>
<h1>${date} 一念三千 · 每日资讯摘要</h1>
${content.replace(/^# .+$/gm, '').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^- (.+)$/gm, '<li>$1</li>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
<div class="footer">由「一念三千」AI 资讯聚合平台自动生成 · ${new Date().toISOString().slice(0, 10)}</div>
</body></html>`;

      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="digest-${date}.html"`,
        },
      });
    }

    return new Response(
      `# ${date} 一念三千 · 每日资讯摘要\n\n${content}\n\n---\n*由「一念三千」AI 资讯聚合平台自动生成*`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="digest-${date}.md"`,
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
