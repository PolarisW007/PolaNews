import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { callLLM, generateImagePrompt, generateImage, downloadAndSaveImage } from '@/lib/ai/llm';

const PLATFORM_PROMPTS: Record<string, string> = {
  xiaohongshu: `你是一位小红书达人博主。请将以下新闻内容改写为小红书风格的中文分享帖。
要求：
- 活泼有趣的标题（用emoji开头）
- 全部使用中文
- 段落简短、排版清晰
- 加入话题标签 #（至少5个）
- 结尾加互动引导（如"你怎么看？"）
- 包含新闻核心事实，不能编造`,

  wechat_moments: `你是一位知性的朋友圈文案撰写者。请将以下新闻内容改写为适合朋友圈分享的中文文案。
要求：简洁知性、精选 3-5 个要点、语言精炼、适度使用 emoji、控制在 200 字以内。`,

  x_en: `You are a tech-savvy Twitter/X content creator. Rewrite the following news into an engaging X (Twitter) post in English.
Requirements:
- Concise, punchy, and informative
- 1-2 key insights or hot takes
- Include relevant hashtags (3-5)
- Use emojis sparingly but effectively
- Under 280 characters if possible, max 2 tweets length
- End with a call to action or thought-provoking question`,

  x_zh: `你是一位精通社交媒体的X(Twitter)内容创作者。请将以下新闻改写为中文X帖子。
要求：
- 简洁有力、信息量大
- 1-2个核心观点或热辣评论
- 包含相关话题标签（3-5个）
- 适度使用emoji
- 控制在280字以内
- 结尾引发讨论`,
};

async function generateShareImages(
  shareId: string,
  title: string,
  content: string
): Promise<void> {
  try {
    await execute(
      "UPDATE social_shares SET image_status = 'generating' WHERE id = $1",
      [shareId]
    );

    const imagePrompt = await generateImagePrompt(title, content);
    const imageUrl = await generateImage(imagePrompt);

    if (imageUrl) {
      const filename = `share_${shareId}.png`;
      const localUrl = await downloadAndSaveImage(imageUrl, filename);
      const finalUrl = localUrl || imageUrl;

      await execute(
        `UPDATE social_shares SET cover_url = $1, images = $2, image_status = 'ready' WHERE id = $3`,
        [finalUrl, JSON.stringify([{ url: finalUrl, prompt: imagePrompt, width: 1024, height: 1024 }]), shareId]
      );
    } else {
      await execute(
        "UPDATE social_shares SET image_status = 'skipped' WHERE id = $1",
        [shareId]
      );
    }
  } catch (e) {
    console.error('[ShareGen] Image generation failed:', e);
    await execute(
      "UPDATE social_shares SET image_status = 'error' WHERE id = $1",
      [shareId]
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, digest_id, article_id, lang = 'zh' } = body as {
      platform: string;
      digest_id?: string;
      article_id?: string;
      lang?: string;
    };

    const validPlatforms = ['xiaohongshu', 'wechat_moments', 'x'];
    if (!platform || !validPlatforms.includes(platform)) {
      return NextResponse.json(
        { success: false, error: '不支持的平台，请选择 xiaohongshu、wechat_moments 或 x' },
        { status: 400 }
      );
    }

    if (!digest_id && !article_id) {
      return NextResponse.json(
        { success: false, error: '请提供 digest_id 或 article_id' },
        { status: 400 }
      );
    }

    const user = await getCurrentUser(req);

    let sourceContent = '';
    let sourceTitle = '';

    if (article_id) {
      const article = await queryOne('SELECT * FROM articles WHERE id = $1', [article_id]) as
        | Record<string, unknown>
        | null;
      if (!article) {
        return NextResponse.json({ success: false, error: '文章不存在' }, { status: 404 });
      }
      sourceTitle = (article.title_zh as string) || (article.title as string) || '';
      sourceContent =
        (article.ai_summary as string) || (article.summary as string) || (article.content as string) || '';
    } else if (digest_id) {
      const digest = await queryOne('SELECT * FROM daily_digests WHERE id = $1', [digest_id]) as
        | Record<string, unknown>
        | null;
      if (!digest) {
        return NextResponse.json({ success: false, error: '摘要不存在' }, { status: 404 });
      }
      sourceTitle = `${digest.digest_date} 每日摘要`;
      sourceContent = (digest.full_content as string) || '';
    }

    let generatedContent = '';
    const shareId = uuidv4();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

    if (platform === 'x') {
      const enPrompt = PLATFORM_PROMPTS.x_en;
      const zhPrompt = PLATFORM_PROMPTS.x_zh;
      const inputPrompt = `Title: ${sourceTitle}\n\nContent:\n${sourceContent.slice(0, 4000)}`;

      const [enContent, zhContent] = await Promise.all([
        callLLM(inputPrompt, enPrompt),
        callLLM(`标题：${sourceTitle}\n\n内容：\n${sourceContent.slice(0, 4000)}`, zhPrompt),
      ]);

      generatedContent = `🌐 English Version:\n\n${enContent}\n\n---\n\n🇨🇳 中文版本:\n\n${zhContent}`;
    } else {
      const systemPrompt = PLATFORM_PROMPTS[platform];
      const prompt = `标题：${sourceTitle}\n\n内容：\n${sourceContent.slice(0, 4000)}`;
      generatedContent = await callLLM(prompt, systemPrompt);
    }

    const titleMatch = generatedContent.match(/^[#🔥📌💡🚨⚡🌐🇨🇳]*\s*\*{0,2}(.{2,60})\*{0,2}/m);
    const title = titleMatch ? titleMatch[1].replace(/^#+\s*/, '').trim() : sourceTitle;

    const publicUrl = `${basePath}/share/${shareId}/public`;

    await execute(
      `INSERT INTO social_shares (id, user_id, digest_id, article_id, platform, title, content, language, template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [shareId, user?.id ?? null, digest_id ?? null, article_id ?? null, platform, title, generatedContent, lang, 'default']
    );

    if (platform === 'xiaohongshu') {
      generateShareImages(shareId, sourceTitle, sourceContent).catch(e =>
        console.error('[ShareGen] Background image gen error:', e)
      );
    }

    const share = await queryOne('SELECT * FROM social_shares WHERE id = $1', [shareId]);

    return NextResponse.json({
      success: true,
      data: {
        ...share,
        public_url: publicUrl,
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
