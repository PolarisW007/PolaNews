import { queryOne } from '../db/schema';
import { parseJsonField } from '../db/helpers';

export async function exportDigestAsMarkdown(digestId: string): Promise<string | null> {
  const digest = await queryOne(
    'SELECT * FROM daily_digests WHERE id = $1', [digestId]
  );
  if (!digest) return null;

  const fullContent = (digest.full_content as string) || '';
  if (fullContent) return fullContent;

  const headlines = parseJsonField(digest.headlines, []) as Array<{ title: string; summary: string }>;
  const categorySummaries = parseJsonField(digest.category_summaries, {}) as Record<string, { count: number; items: Array<{ title: string; summary: string }> }>;
  const stats = parseJsonField(digest.statistics, {}) as { total_articles?: number; source_count?: number };

  let md = `# 一念三千 Daily Digest — ${digest.digest_date}\n\n`;

  if (headlines.length > 0) {
    md += `## 🔥 今日头条\n\n`;
    headlines.forEach((h, i) => {
      md += `${i + 1}. **${h.title}**\n   ${h.summary}\n\n`;
    });
  }

  if (Object.keys(categorySummaries).length > 0) {
    md += `## 🌍 分类速览\n\n`;
    for (const [cat, data] of Object.entries(categorySummaries)) {
      md += `### 【${cat}】${data.count} 条\n\n`;
      for (const item of data.items) {
        md += `- **${item.title}** — ${item.summary}\n`;
      }
      md += '\n';
    }
  }

  md += `## 📊 今日数据\n\n`;
  md += `- 共收录 ${stats.total_articles || 0} 条新闻\n`;
  md += `- 覆盖 ${stats.source_count || 0} 个信源\n`;

  return md;
}

export async function exportDigestAsPdfHtml(digestId: string): Promise<string | null> {
  const md = await exportDigestAsMarkdown(digestId);
  if (!md) return null;

  const lines = md.split('\n');
  let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #f5f5f5; }
  h1 { color: #00C853; border-bottom: 2px solid #00E676; padding-bottom: 10px; }
  h2 { color: #333; margin-top: 30px; }
  h3 { color: #555; }
  li { margin: 4px 0; line-height: 1.6; }
  strong { color: #1A2E23; }
</style></head><body>`;

  for (const line of lines) {
    if (line.startsWith('# ')) html += `<h1>${line.slice(2)}</h1>`;
    else if (line.startsWith('## ')) html += `<h2>${line.slice(3)}</h2>`;
    else if (line.startsWith('### ')) html += `<h3>${line.slice(4)}</h3>`;
    else if (line.startsWith('- ')) html += `<li>${line.slice(2)}</li>`;
    else if (line.match(/^\d+\./)) html += `<li>${line}</li>`;
    else if (line.trim()) html += `<p>${line}</p>`;
  }

  html += '</body></html>';
  return html;
}
