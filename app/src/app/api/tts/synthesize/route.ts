import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';
import { synthesizeAudio } from '@/lib/services/tts';
import { queryOne, execute } from '@/lib/db/schema';

const AUDIO_DIR = join(process.cwd(), 'data', 'audio');

function audioColFor(lang: string): 'audio_url' | 'audio_url_en' | 'audio_url_ja' {
  if (lang === 'en') return 'audio_url_en';
  if (lang === 'ja') return 'audio_url_ja';
  return 'audio_url';
}

function fileFromUrl(url: string): string | null {
  // URL 格式：${basePath}/api/tts/audio/{filename}
  const m = url.match(/\/api\/tts\/audio\/([^/?#]+)$/);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      voice = 'longshu_v3',
      articleId,
      lang = 'zh',
    } = body as { text?: string; voice?: string; articleId?: string; lang?: 'zh' | 'en' | 'ja' };

    if (!text || !text.trim()) {
      return NextResponse.json(
        { success: false, error: '合成文本不能为空' },
        { status: 400 }
      );
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { success: false, error: '文本长度不能超过5000字' },
        { status: 400 }
      );
    }

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const col = audioColFor(lang);

    // 若带 articleId，优先命中数据库已持久化的音频
    if (articleId) {
      try {
        const row = await queryOne(
          `SELECT ${col} AS url FROM articles WHERE id = $1`,
          [articleId]
        ) as { url: string | null } | null;
        const cachedUrl = row?.url || '';
        if (cachedUrl) {
          const fname = fileFromUrl(cachedUrl);
          if (fname && existsSync(join(AUDIO_DIR, fname))) {
            return NextResponse.json({
              success: true,
              data: { url: cachedUrl, filename: fname, cached: true },
            });
          }
        }
      } catch {
        // 失败降级：继续走合成
      }
    }

    const result = await synthesizeAudio(text.trim(), voice);
    if (!result) {
      return NextResponse.json(
        { success: false, error: '语音合成服务暂不可用，请检查 DASHSCOPE_API_KEY 配置' },
        { status: 502 }
      );
    }

    const url = `${basePath}/api/tts/audio/${result.filename}`;

    // 持久化到数据库以便下次复用
    if (articleId) {
      try {
        if (col === 'audio_url') {
          await execute(
            `UPDATE articles SET ${col} = $1, audio_voice = $2 WHERE id = $3`,
            [url, voice, articleId]
          );
        } else {
          await execute(
            `UPDATE articles SET ${col} = $1 WHERE id = $2`,
            [url, articleId]
          );
        }
      } catch (e) {
        console.error('[TTS] persist audio_url failed:', e);
      }
    }

    return NextResponse.json({
      success: true,
      data: { url, filename: result.filename, cached: false },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '语音合成失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
