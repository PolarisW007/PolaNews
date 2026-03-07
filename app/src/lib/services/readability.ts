import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { execute, queryOne } from '../db/schema';

export interface ReadabilityResult {
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline: string;
  siteName: string;
}

export async function extractFullContent(url: string): Promise<ReadabilityResult | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WorldOverview/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) return null;

    return {
      title: article.title || '',
      content: article.content || '',
      textContent: article.textContent || '',
      excerpt: article.excerpt || '',
      byline: article.byline || '',
      siteName: article.siteName || '',
    };
  } catch (e) {
    console.error(`[Readability] Failed to extract: ${url}`, e);
    return null;
  }
}

export async function fetchAndStoreFullContent(articleId: string): Promise<boolean> {
  const article = await queryOne<{ url: string; full_content: string }>(
    'SELECT url, full_content FROM articles WHERE id = $1', [articleId]
  );
  if (!article) return false;
  if (article.full_content) return true;

  const extracted = await extractFullContent(article.url);
  if (!extracted) return false;

  await execute(
    'UPDATE articles SET full_content = $1, content = CASE WHEN content = \'\' THEN $2 ELSE content END WHERE id = $3',
    [extracted.content, extracted.textContent, articleId]
  );

  return true;
}
