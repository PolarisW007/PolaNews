import { execute, queryOne } from '../db/schema';

export interface TTSVoice {
  id: string;
  name: string;
  language: string;
  gender: string;
}

export const AVAILABLE_VOICES: TTSVoice[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (女声)', language: 'zh', gender: 'female' },
  { id: 'zh-CN-YunxiNeural', name: '云希 (男声)', language: 'zh', gender: 'male' },
  { id: 'zh-CN-YunjianNeural', name: '云健 (男声/新闻)', language: 'zh', gender: 'male' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊 (女声)', language: 'zh', gender: 'female' },
  { id: 'en-US-JennyNeural', name: 'Jenny (Female)', language: 'en', gender: 'female' },
  { id: 'en-US-GuyNeural', name: 'Guy (Male)', language: 'en', gender: 'male' },
  { id: 'ja-JP-NanamiNeural', name: 'Nanami (女性)', language: 'ja', gender: 'female' },
  { id: 'ja-JP-KeitaNeural', name: 'Keita (男性)', language: 'ja', gender: 'male' },
];

export async function generateTTSAudio(
  text: string,
  voice: string = 'zh-CN-YunjianNeural'
): Promise<Buffer | null> {
  const edgeTTSAvailable = process.env.EDGE_TTS_ENABLED === 'true';
  const cosyVoiceKey = process.env.COSYVOICE_API_KEY;

  if (cosyVoiceKey) {
    return generateCosyVoice(text, voice, cosyVoiceKey);
  }

  if (edgeTTSAvailable) {
    return generateEdgeTTS(text, voice);
  }

  console.warn('[TTS] No TTS engine configured');
  return null;
}

async function generateCosyVoice(text: string, voice: string, apiKey: string): Promise<Buffer | null> {
  try {
    const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cosyvoice-v1',
        input: { text },
        parameters: { voice },
      }),
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer);
  } catch (e) {
    console.error('[TTS] CosyVoice error:', e);
    return null;
  }
}

async function generateEdgeTTS(text: string, voice: string): Promise<Buffer | null> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { readFile, unlink } = await import('fs/promises');
    const execAsync = promisify(exec);

    const tmpFile = join(tmpdir(), `tts_${Date.now()}.mp3`);
    await execAsync(`edge-tts --voice "${voice}" --text "${text.replace(/"/g, '\\"').slice(0, 5000)}" --write-media "${tmpFile}"`);
    const buffer = await readFile(tmpFile);
    await unlink(tmpFile).catch(() => {});
    return buffer;
  } catch (e) {
    console.error('[TTS] Edge TTS error:', e);
    return null;
  }
}

export async function generateBroadcastAudio(broadcastId: string): Promise<boolean> {
  const broadcast = await queryOne<{
    id: string; script: string; segments: Array<{ index: number; text: string }>;
    voice_id: string; language: string;
  }>('SELECT * FROM broadcasts WHERE id = $1', [broadcastId]);

  if (!broadcast) return false;

  const segments = Array.isArray(broadcast.segments) ? broadcast.segments :
    (typeof broadcast.segments === 'string' ? JSON.parse(broadcast.segments) : []);
  const voice = broadcast.voice_id || 'zh-CN-YunjianNeural';

  let totalDuration = 0;
  const updatedSegments = [];

  for (const seg of segments) {
    const audio = await generateTTSAudio(seg.text, voice);
    const durationMs = audio ? Math.round(audio.length / 32 * 1000 / 1000) : seg.text.length * 120;
    totalDuration += durationMs;

    updatedSegments.push({
      ...seg,
      duration_ms: durationMs,
      audio_available: !!audio,
    });
  }

  await execute(
    `UPDATE broadcasts SET segments = $1, total_duration_ms = $2, status = 'ready' WHERE id = $3`,
    [JSON.stringify(updatedSegments), totalDuration, broadcastId]
  );

  return true;
}
