import { existsSync, mkdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execute, query, queryOne } from '../db/schema';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.COSYVOICE_API_KEY || '';

const AUDIO_DIR = join(process.cwd(), 'data', 'audio');

function ensureAudioDir() {
  if (!existsSync(AUDIO_DIR)) {
    mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

export interface TTSVoice {
  id: string;
  name: string;
  language: string;
  gender: string;
  description: string;
}

export const AVAILABLE_VOICES: TTSVoice[] = [
  { id: 'longshu_v3', name: '龙书', language: 'zh', gender: 'male', description: '沉稳青年男，适合新闻播报' },
  { id: 'longshuo_v3', name: '龙硕', language: 'zh', gender: 'male', description: '博才干练男，新闻主播风格' },
  { id: 'longanyang', name: '龙安洋', language: 'zh', gender: 'male', description: '阳光大男孩，支持情感表达' },
  { id: 'longxiaochun_v3', name: '龙小淳', language: 'zh', gender: 'female', description: '知性积极女声' },
  { id: 'longxiaoxia_v3', name: '龙小夏', language: 'zh', gender: 'female', description: '沉稳权威女声' },
  { id: 'longlaotie_v3', name: '龙老铁', language: 'zh', gender: 'male', description: '东北直率男，深度分析' },
  { id: 'longyue_v3', name: '龙悦', language: 'zh', gender: 'female', description: '温暖磁性女声' },
  { id: 'longwan_v3', name: '龙婉', language: 'zh', gender: 'female', description: '细腻柔声女，知性大方' },
];

const VOICE_COMPAT_MAP: Record<string, string> = {
  longshu: 'longshu_v3',
  longshuo: 'longshuo_v3',
  longxiaochun: 'longxiaochun_v3',
  longxiaoxia: 'longxiaoxia_v3',
  longlaotie: 'longlaotie_v3',
  longyue: 'longyue_v3',
  longwan: 'longwan_v3',
  longxiaobai: 'longxiaobai_v3',
  longxiaofei: 'longanyang',
};

export async function synthesizeAudio(
  text: string,
  voice: string = 'longshu_v3'
): Promise<{ filename: string; filepath: string } | null> {
  ensureAudioDir();

  const resolvedVoice = VOICE_COMPAT_MAP[voice] || voice;

  if (DASHSCOPE_API_KEY) {
    const result = await synthesizeCosyVoice(text, resolvedVoice);
    if (result) return result;
  }

  return synthesizeEdgeTTS(text, resolvedVoice);
}

async function synthesizeCosyVoice(
  text: string,
  voice: string
): Promise<{ filename: string; filepath: string } | null> {
  const filename = `${uuidv4()}.mp3`;
  const filepath = join(AUDIO_DIR, filename);

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const scriptPath = join(process.cwd(), 'scripts', 'tts_cosyvoice.py');
    if (!existsSync(scriptPath)) {
      console.warn('[TTS] CosyVoice Python 脚本不存在，降级到 edge-tts');
      return null;
    }

    const safeText = text.slice(0, 800).replace(/'/g, "'\\''");
    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}" --text '${safeText}' --voice "${voice}" --output "${filepath}" --model cosyvoice-v3-flash`,
      {
        timeout: 60000,
        env: { ...process.env, DASHSCOPE_API_KEY },
      }
    );

    if (stdout.includes('OK:')) {
      return { filename, filepath };
    }

    console.error(`[TTS] CosyVoice Python 脚本错误: ${stderr}`);
    return null;
  } catch (e) {
    console.error('[TTS] CosyVoice 合成失败:', e);
    return null;
  }
}

async function synthesizeEdgeTTS(
  text: string,
  _voice: string
): Promise<{ filename: string; filepath: string } | null> {
  const edgeVoice = 'zh-CN-YunjianNeural';

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const filename = `${uuidv4()}.mp3`;
    const filepath = join(AUDIO_DIR, filename);
    const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 5000);
    await execAsync(`edge-tts --voice "${edgeVoice}" --text "${safeText}" --write-media "${filepath}"`, {
      timeout: 60000,
    });
    return { filename, filepath };
  } catch (e) {
    console.error('[TTS] Edge TTS 降级也失败:', e);
    return null;
  }
}

export function getAudioPath(filename: string): string {
  return join(AUDIO_DIR, filename);
}

export async function readAudioFile(filename: string): Promise<Buffer | null> {
  const filepath = join(AUDIO_DIR, filename);
  try {
    return await readFile(filepath);
  } catch {
    return null;
  }
}

export async function generateBroadcastAudio(broadcastId: string): Promise<boolean> {
  const broadcast = await queryOne<Record<string, unknown>>(
    'SELECT * FROM broadcasts WHERE id = $1', [broadcastId]
  );
  if (!broadcast) return false;

  const rawSegments = broadcast.segments;
  const segments: Array<{ index: number; text: string }> = Array.isArray(rawSegments)
    ? rawSegments as Array<{ index: number; text: string }>
    : (typeof rawSegments === 'string' ? JSON.parse(rawSegments) : []);

  const voice = (broadcast.voice_id as string) || 'longshu_v3';

  let totalDuration = 0;
  const updatedSegments = [];

  for (const seg of segments) {
    if (!seg.text || seg.text.trim().length === 0) {
      updatedSegments.push({ ...seg, duration_ms: 0, audio_url: null });
      continue;
    }

    const result = await synthesizeAudio(seg.text, voice);
    const durationMs = result
      ? Math.round((seg.text.length / 4) * 1000)
      : seg.text.length * 120;
    totalDuration += durationMs;

    updatedSegments.push({
      ...seg,
      duration_ms: durationMs,
      audio_url: result ? `/api/tts/audio/${result.filename}` : null,
    });
  }

  await execute(
    `UPDATE broadcasts SET segments = $1, total_duration_ms = $2, status = 'ready' WHERE id = $3`,
    [JSON.stringify(updatedSegments), totalDuration, broadcastId]
  );

  return true;
}

/**
 * 为已翻译但没有语音的最新文章预合成中文语音并持久化 audio_url。
 * 优先使用 title_zh + ai_summary / summary_zh，回退到原文标题+摘要。
 * 失败时不抛错，仅跳过该条；返回成功合成的数量。
 */
export async function synthesizePendingAudio(
  limit = 20,
  voice = 'longshu_v3'
): Promise<number> {
  const rows = await query<{
    id: string;
    title: string;
    title_zh: string;
    summary: string;
    summary_zh: string;
    ai_summary: string;
  }>(
    `SELECT id, title, title_zh, summary, summary_zh, ai_summary
     FROM articles
     WHERE (audio_url IS NULL OR audio_url = '')
       AND (title_zh IS NOT NULL AND title_zh <> '')
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $1`,
    [limit]
  );

  if (rows.length === 0) return 0;

  let synthesized = 0;
  for (const row of rows) {
    const title = (row.title_zh || row.title || '').trim();
    const body = (row.ai_summary || row.summary_zh || row.summary || '').trim();
    const text = (title && body ? `${title}。${body}` : title || body).slice(0, 500);
    if (!text) continue;

    try {
      const result = await synthesizeAudio(text, voice);
      if (!result) continue;
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const url = `${basePath}/api/tts/audio/${result.filename}`;
      await execute(
        'UPDATE articles SET audio_url = $1, audio_voice = $2 WHERE id = $3',
        [url, voice, row.id]
      );
      synthesized++;
    } catch (e) {
      console.error('[TTS] synthesizePendingAudio failed for', row.id, e);
    }
  }

  return synthesized;
}
