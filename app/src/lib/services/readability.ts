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
  const localResult = await extractWithReadability(url);
  if (localResult) return localResult;
  return extractWithJinaReader(url);
}

async function extractWithReadability(url: string): Promise<ReadabilityResult | null> {
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

export async function extractWithJinaReader(url: string): Promise<ReadabilityResult | null> {
  if (!isPublicHttpUrl(url)) return null;

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PolaNews/1.0 source-reach)',
        'Accept': 'text/plain',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;

    const text = normalizeJinaText(await res.text());
    if (!text || text.length < 120) return null;

    return {
      title: firstNonEmptyLine(text).slice(0, 180),
      content: textToHtml(text),
      textContent: text,
      excerpt: text.slice(0, 280),
      byline: '',
      siteName: 'Jina Reader',
    };
  } catch (e) {
    console.error(`[Readability] Jina fallback failed: ${url}`, e);
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

function isPublicHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeJinaText(text: string): string {
  return text
    .replace(/^Title:\s*/i, '')
    .replace(/^URL Source:\s*\S+\s*/im, '')
    .replace(/^Markdown Content:\s*/im, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstNonEmptyLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find(Boolean) || 'Untitled';
}

function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 160);

  return `<article data-source="jina-reader">${paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('')}</article>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
