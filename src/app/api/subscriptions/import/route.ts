import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';

interface ParsedOutline {
  xmlUrl: string;
  title: string;
  text: string;
  htmlUrl: string;
}

function parseOpmlOutlines(opml: string): ParsedOutline[] {
  const outlines: ParsedOutline[] = [];
  // 标准化空白以支持多行 <outline> 标签
  const opmlNorm = opml.replace(/\s+/g, ' ');
  const outlineRegex =
    /<outline\s[^>]*(?:xmlUrl|xmlurl)\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((m = outlineRegex.exec(opmlNorm)) !== null) {
    const tag = m[0];
    const xmlUrl = m[1]?.trim();
    if (!xmlUrl || seen.has(xmlUrl)) continue;
    seen.add(xmlUrl);

    const titleMatch = tag.match(/(?:title)\s*=\s*["']([^"']*)["']/i);
    const textMatch = tag.match(/(?:text)\s*=\s*["']([^"']*)["']/i);
    const htmlUrlMatch = tag.match(/(?:htmlUrl|htmlurl)\s*=\s*["']([^"']*)["']/i);

    const title = titleMatch?.[1] || textMatch?.[1] || xmlUrl;
    const text = textMatch?.[1] || titleMatch?.[1] || title;
    const htmlUrl = htmlUrlMatch?.[1] || '';

    outlines.push({
      xmlUrl,
      title: title || xmlUrl,
      text: text || title || xmlUrl,
      htmlUrl,
    });
  }

  return outlines;
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
    const opml = body?.opml;

    if (typeof opml !== 'string' || !opml.trim()) {
      return NextResponse.json(
        { success: false, error: 'opml 字符串为必填项' },
        { status: 400 }
      );
    }

    const parsed = parseOpmlOutlines(opml);
    if (parsed.length === 0) {
      return NextResponse.json({
        success: true,
        data: { imported: 0, total: 0 },
      });
    }

    const db = getDb();
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO feeds (id, title, url, site_url, language, category, status, is_preset)
      VALUES (?, ?, ?, ?, 'en', 'general', 'active', 0)
    `);

    let imported = 0;
    const insertMany = db.transaction(() => {
      for (const item of parsed) {
        const id = uuidv4();
        const result = insertStmt.run(
          id,
          item.title || item.text || 'Unknown',
          item.xmlUrl,
          item.htmlUrl || ''
        );
        if (result.changes > 0) imported++;
      }
    });

    insertMany();

    return NextResponse.json({
      success: true,
      data: { imported, total: parsed.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
