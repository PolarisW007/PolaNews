import { NextRequest, NextResponse } from 'next/server';
import { exportDigestAsMarkdown, exportDigestAsPdfHtml } from '@/lib/services/export';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'markdown';

    if (format === 'markdown') {
      const markdown = await exportDigestAsMarkdown(id);
      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="digest-${id}.md"`,
        },
      });
    }

    if (format === 'pdf') {
      const html = await exportDigestAsPdfHtml(id);
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    return NextResponse.json(
      { success: false, error: '不支持的导出格式，请使用 markdown 或 pdf' },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
