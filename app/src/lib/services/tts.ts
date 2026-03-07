import { existsSync, mkdirSync } from 'fs';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryOne } from '../db/schema';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.COSYVOICE_API_KEY || '';
const COSYVOICE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/audio/speech';

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
  { id: 'longxiaochun', name: '龙小淳', language: 'zh', gender: 'female', description: '温柔女声，适合讲解和叙述' },
  { id: 'longxiaoxia', name: '龙小夏', language: 'zh', gender: 'female', description: '活泼女声，适合新闻播报' },
  { id: 'longxiaobai', name: '龙小白', language: 'zh', gender: 'male', description: '年轻男声，清晰自然' },
  { id: 'longlaotie', name: '龙老铁', language: 'zh', gender: 'male', description: '浑厚男声，适合深度分析' },
  { id: 'longshu', name: '龙叔', language: 'zh', gender: 'male', description: '成熟男声，适合新闻主播' },
  { id: 'longxiaofei', name: '龙小飞', language: 'zh', gender: 'male', description: '阳光男声，朝气蓬勃' },
  { id: 'longyue', name: '龙悦', language: 'zh', gender: 'female', description: '甜美女声，亲切自然' },
  { id: 'longwan', name: '龙婉', language: 'zh', gender: 'female', description: '优雅女声，知性大方' },
];

export async function synthesizeAudio(
  text: string,
  voice: string = 'longshu'
): Promise<{ filename: string; filepath: string } | null> {
  ensureAudioDir();

  if (!DASHSCOPE_API_KEY) {
    console.warn('[TTS] DASHSCOPE_API_KEY 未配置，使用 edge-tts 降级');
    return synthesizeEdgeTTS(text, voice);
  }

  return synthesizeCosyVoice(text, voice);
}

async function synthesizeCosyVoice(
  text: string,
  voice: string
): Promise<{ filename: string; filepath: string } | null> {
  const filename = `${uuidv4()}.mp3`;
  const filepath = join(AUDIO_DIR, filename);

  try {
    const res = await fetch(COSYVOICE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cosyvoice-v1',
        input: { text: text.slice(0, 5000) },
        voice,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[TTS] CosyVoice API 错误 ${res.status}: ${errText}`);
      return synthesizeEdgeTTS(text, voice);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(filepath, buffer);
    return { filename, filepath };
  } catch (e) {
    console.error('[TTS] CosyVoice 合成失败:', e);
    return synthesizeEdgeTTS(text, voice);
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

  const voice = (broadcast.voice_id as string) || 'longshu';

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
