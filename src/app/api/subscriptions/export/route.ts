import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/schema';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, title, url, site_url, category FROM feeds ORDER BY category, title`
      )
      .all() as { id: string; title: string; url: string; site_url: string; category: string }[];

    const byCategory = new Map<string, typeof rows>();
    for (const row of rows) {
      const cat = row.category || 'general';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(row);
    }

    const bodyParts: string[] = [];
    for (const [category, feeds] of byCategory.entries()) {
      const catLabel = escapeXml(category);
      const outlineItems = feeds
        .map(
          (f) =>
            `    <outline type="rss" text="${escapeXml(f.title)}" title="${escapeXml(f.title)}" xmlUrl="${escapeXml(f.url)}" htmlUrl="${escapeXml(f.site_url || '')}"/>`
        )
        .join('\n');
      bodyParts.push(`  <outline text="${catLabel}">\n${outlineItems}\n  </outline>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>一念三千 RSS 订阅源</title></head>
  <body>
${bodyParts.join('\n')}
  </body>
</opml>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': 'attachment; filename="subscriptions.opml"',
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
