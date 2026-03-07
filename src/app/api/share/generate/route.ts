import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { callLLM } from '@/lib/ai/llm';

const PLATFORM_PROMPTS: Record<string, string> = {
  xiaohongshu:
    '你是一位小红书达人博主。请将以下新闻内容改写为小红书风格的分享帖。要求：活泼有趣的标题、emoji 丰富、段落简短、加入话题标签 #、结尾加互动引导（如"你怎么看？欢迎评论区讨论~"）。',
  wechat_moments:
    '你是一位知性的朋友圈文案撰写者。请将以下新闻内容改写为适合朋友圈分享的文案。要求：简洁知性、精选 3-5 个要点、语言精炼、适度使用 emoji、控制在 200 字以内。',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, digest_id, article_id, lang = 'zh' } = body as {
      platform: string;
      digest_id?: string;
      article_id?: string;
      lang?: string;
    };

    if (!platform || !PLATFORM_PROMPTS[platform]) {
      return NextResponse.json(
        { success: false, error: '不支持的平台，请选择 xiaohongshu 或 wechat_moments' },
        { status: 400 }
      );
    }

    if (!digest_id && !article_id) {
      return NextResponse.json(
        { success: false, error: '请提供 digest_id 或 article_id' },
        { status: 400 }
      );
    }

    const db = getDb();
    const user = getCurrentUser(req);

    let sourceContent = '';
    let sourceTitle = '';

    if (article_id) {
      const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(article_id) as
        | Record<string, unknown>
        | undefined;
      if (!article) {
        return NextResponse.json(
          { success: false, error: '文章不存在' },
          { status: 404 }
        );
      }
      sourceTitle = (article.title as string) || '';
      sourceContent =
        (article.ai_summary as string) || (article.summary as string) || (article.content as string) || '';
    } else if (digest_id) {
      const digest = db.prepare('SELECT * FROM daily_digests WHERE id = ?').get(digest_id) as
        | Record<string, unknown>
        | undefined;
      if (!digest) {
        return NextResponse.json(
          { success: false, error: '摘要不存在' },
          { status: 404 }
        );
      }
      sourceTitle = `${digest.digest_date} 每日摘要`;
      sourceContent = (digest.full_content as string) || '';
    }

    const systemPrompt = PLATFORM_PROMPTS[platform];
    const prompt = `标题：${sourceTitle}\n\n内容：\n${sourceContent.slice(0, 4000)}`;

    const generated = await callLLM(prompt, systemPrompt);

    const titleMatch = generated.match(/^#?\s*(.+)/);
    const title = titleMatch ? titleMatch[1].replace(/^#+\s*/, '').trim() : sourceTitle;

    const id = uuidv4();
    db.prepare(
      `INSERT INTO social_shares (id, user_id, digest_id, article_id, platform, title, content, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, user?.id ?? null, digest_id ?? null, article_id ?? null, platform, title, generated, lang);

    const share = db.prepare('SELECT * FROM social_shares WHERE id = ?').get(id);

    return NextResponse.json({ success: true, data: share });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
