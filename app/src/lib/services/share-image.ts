import { execute, queryOne } from '../db/schema';

export async function generateShareImages(shareId: string): Promise<boolean> {
  const share = await queryOne<{
    id: string; platform: string; title: string; content: string;
  }>('SELECT * FROM social_shares WHERE id = $1', [shareId]);

  if (!share) return false;

  await execute(
    `UPDATE social_shares SET image_status = 'generating' WHERE id = $1`, [shareId]
  );

  try {
    const images = await createShareCard(share.title, share.content, share.platform);
    await execute(
      `UPDATE social_shares SET images = $1, image_status = 'ready' WHERE id = $2`,
      [JSON.stringify(images), shareId]
    );
    return true;
  } catch (e) {
    console.error('[ShareImage] Generation failed:', e);
    await execute(
      `UPDATE social_shares SET image_status = 'error' WHERE id = $1`, [shareId]
    );
    return false;
  }
}

async function createShareCard(
  title: string,
  content: string,
  platform: string
): Promise<Array<{ url: string; width: number; height: number; order: number }>> {
  try {
    const sharp = (await import('sharp')).default;

    const width = platform === 'xiaohongshu' ? 1080 : 1080;
    const height = platform === 'xiaohongshu' ? 1440 : 1080;

    const lines = content.split('\n').filter(l => l.trim()).slice(0, 8);
    const textLines = lines.map((line, i) => {
      const y = 300 + i * 60;
      const text = line.slice(0, 40).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<text x="80" y="${y}" fill="#E0F2E9" font-size="28" font-family="sans-serif">${text}</text>`;
    }).join('');

    const safeTitle = title.slice(0, 30).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const dateStr = new Date().toLocaleDateString('zh-CN');

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style="stop-color:#0A0F0D"/>
            <stop offset="100%" style="stop-color:#111A16"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        <rect x="40" y="40" width="${width - 80}" height="4" rx="2" fill="#00E676"/>
        <text x="80" y="120" fill="#00E676" font-size="20" font-family="sans-serif">一念三千 · ${dateStr}</text>
        <text x="80" y="200" fill="#E0F2E9" font-size="36" font-weight="bold" font-family="sans-serif">${safeTitle}</text>
        ${textLines}
        <text x="80" y="${height - 80}" fill="#3E5248" font-size="18" font-family="sans-serif">WorldOverview · 全球资讯AI聚合阅读平台</text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const base64 = `data:image/png;base64,${buffer.toString('base64')}`;

    return [{ url: base64, width, height, order: 1 }];
  } catch (e) {
    console.error('[ShareImage] Sharp error:', e);
    return [];
  }
}
