import { existsSync, mkdirSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execute, query, queryOne, withTransaction } from '../db/schema';
import { buildArticleSpeechText } from '../article-speech';
import { createHash } from 'crypto';
import type {
  AudioRetentionOptions,
  AudioRetentionResult,
  AudioRetentionStore,
  StaleArticleAudioReference,
} from './audio-retention';
import {
  getAudioRetentionCutoff,
  resolveAudioDirectory,
  runAudioRetention,
} from './audio-retention';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || process.env.COSYVOICE_API_KEY || '';
const PREFER_EDGE_TTS = process.env.TTS_PROVIDER === 'edge' || process.env.EDGE_TTS_ENABLED === 'true';
let cosyVoiceUnavailable = false;

const AUDIO_DIR = resolveAudioDirectory();
const AUDIO_FILENAME_RE = /^[\w-]+\.mp3$/;

export function hashSpeechText(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

function ensureAudioDir() {
  if (!existsSync(AUDIO_DIR)) {
    mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

function resolveAudioFile(filename: string): string {
  if (!AUDIO_FILENAME_RE.test(filename)) {
    throw new Error('Invalid audio filename');
  }
  return join(AUDIO_DIR, filename);
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

  if (DASHSCOPE_API_KEY && !PREFER_EDGE_TTS && !cosyVoiceUnavailable) {
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
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const scriptPath = join(process.cwd(), 'scripts', 'tts_cosyvoice.py');
    if (!existsSync(scriptPath)) {
      console.warn('[TTS] CosyVoice Python 脚本不存在，降级到 edge-tts');
      return null;
    }

    const { stdout, stderr } = await execFileAsync(
      'python3',
      [
        scriptPath,
        '--text', text.slice(0, 1600),
        '--voice', voice,
        '--output', filepath,
        '--model', 'cosyvoice-v3-flash',
      ],
      {
        timeout: 60000,
        env: { ...process.env, DASHSCOPE_API_KEY },
      }
    );

    if (stdout.includes('OK:')) {
      return { filename, filepath };
    }

    const output = `${stdout}\n${stderr}`;
    if (/Arrearage|Access denied|overdue-payment|account is in good standing/i.test(output)) {
      cosyVoiceUnavailable = true;
      console.error('[TTS] CosyVoice 账号不可用，已切换到 edge-tts 降级合成');
      return null;
    }

    console.error('[TTS] CosyVoice Python script failed', {
      error: stderr ? 'provider_error' : 'empty_response',
    });
    return null;
  } catch (e) {
    const message = e instanceof Error ? `${e.message}\n${'stdout' in e ? String((e as { stdout?: unknown }).stdout || '') : ''}` : String(e);
    if (/Arrearage|Access denied|overdue-payment|account is in good standing/i.test(message)) {
      cosyVoiceUnavailable = true;
      console.error('[TTS] CosyVoice 账号不可用，已切换到 edge-tts 降级合成');
      return null;
    }
    console.error('[TTS] CosyVoice synthesis failed', {
      error: e instanceof Error ? e.name : 'unknown',
    });
    return null;
  }
}

async function synthesizeEdgeTTS(
  text: string,
  _voice: string
): Promise<{ filename: string; filepath: string } | null> {
  void _voice;
  const edgeVoice = 'zh-CN-YunjianNeural';

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const filename = `${uuidv4()}.mp3`;
    const filepath = join(AUDIO_DIR, filename);
    const safeText = text.replace(/\n/g, ' ').slice(0, 5000);
    await execFileAsync('edge-tts', [
      '--voice', edgeVoice,
      '--text', safeText,
      '--write-media', filepath,
    ], {
      timeout: 60000,
    });
    return { filename, filepath };
  } catch (e) {
    console.error('[TTS] Edge TTS fallback failed', {
      error: e instanceof Error ? e.name : 'unknown',
    });
    return null;
  }
}

export function getAudioPath(filename: string): string {
  return resolveAudioFile(filename);
}

export function audioFileExists(filename: string): boolean {
  try {
    return existsSync(resolveAudioFile(filename));
  } catch {
    return false;
  }
}

export async function readAudioFile(filename: string): Promise<Buffer | null> {
  try {
    const filepath = resolveAudioFile(filename);
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

export interface ArticleAudioSourceRow {
  id: string;
  title: string;
  title_zh: string;
  summary: string;
  summary_zh: string;
  ai_summary: string;
  ai_key_points: unknown;
}

export async function synthesizeAndPersistArticleAudio(
  row: ArticleAudioSourceRow,
  voice = 'longshu_v3',
): Promise<boolean> {
  const text = buildArticleSpeechText(row, 'zh', 1600);
  if (!text) return false;

  const result = await synthesizeAudio(text, voice);
  if (!result) return false;

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const url = `${basePath}/api/tts/audio/${result.filename}`;
  try {
    const updated = await execute(
      `UPDATE articles
       SET audio_url = $1, audio_voice = $2, audio_text_hash = $3
       WHERE id = $4
         AND ((audio_url IS NULL OR audio_url = '') OR (audio_text_hash IS NULL OR audio_text_hash = ''))`,
      [url, voice, hashSpeechText(text), row.id],
    );
    if (updated > 0) return true;
  } catch (error) {
    await unlink(result.filepath).catch(() => undefined);
    throw error;
  }

  await unlink(result.filepath).catch(() => undefined);
  return false;
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
  const retentionCutoff = getAudioRetentionCutoff();
  const rows = await query<ArticleAudioSourceRow>(
    `SELECT id, title, title_zh, summary, summary_zh, ai_summary, ai_key_points
     FROM articles
     WHERE ((audio_url IS NULL OR audio_url = '') OR (audio_text_hash IS NULL OR audio_text_hash = ''))
       AND COALESCE(published_at, created_at) >= $2
     ORDER BY published_at DESC NULLS LAST, created_at DESC
     LIMIT $1`,
    [limit, retentionCutoff]
  );

  if (rows.length === 0) return 0;

  let synthesized = 0;
  for (const row of rows) {
    try {
      if (await synthesizeAndPersistArticleAudio(row, voice)) synthesized++;
    } catch (e) {
      console.error('[TTS] synthesizePendingAudio failed', {
        articleId: row.id,
        error: e instanceof Error ? e.name : 'unknown',
      });
    }
  }

  return synthesized;
}

function createAudioRetentionStore(): AudioRetentionStore {
  return {
    async listBroadcastSegments() {
      const rows = await query<{ segments: unknown }>(
        `SELECT segments
         FROM broadcasts
         WHERE segments IS NOT NULL AND segments <> '[]'::jsonb`,
      );
      return rows.map((row) => row.segments);
    },

    async listArticleAudioReferences() {
      return query<{
        id: string;
        audio_url: string | null;
        audio_url_en: string | null;
        audio_url_ja: string | null;
      }>(
        `SELECT id, audio_url, audio_url_en, audio_url_ja
         FROM articles
         WHERE COALESCE(audio_url, '') <> ''
            OR COALESCE(audio_url_en, '') <> ''
            OR COALESCE(audio_url_ja, '') <> ''`,
      );
    },

    async clearArticleAudioReferences(references: StaleArticleAudioReference[]) {
      if (references.length === 0) return 0;
      return withTransaction(async (client) => {
        const columns = {
          zh: ['audio_url', 'audio_text_hash'],
          en: ['audio_url_en', 'audio_text_hash_en'],
          ja: ['audio_url_ja', 'audio_text_hash_ja'],
        } as const;
        let cleared = 0;
        for (const language of ['zh', 'en', 'ja'] as const) {
          const matches = references.filter((reference) => reference.language === language);
          if (matches.length === 0) continue;
          const [urlColumn, hashColumn] = columns[language];
          const result = await client.query(
            `UPDATE articles AS article
             SET ${urlColumn} = '', ${hashColumn} = ''
             FROM unnest($1::uuid[], $2::text[]) AS stale(id, url)
             WHERE article.id = stale.id AND article.${urlColumn} = stale.url`,
            [matches.map((reference) => reference.id), matches.map((reference) => reference.url)],
          );
          cleared += result.rowCount ?? 0;
        }
        return cleared;
      });
    },
  };
}

export async function runConfiguredAudioRetention(
  options: AudioRetentionOptions = {},
): Promise<AudioRetentionResult> {
  return runAudioRetention(
    { ...options, audioDir: AUDIO_DIR },
    createAudioRetentionStore(),
  );
}
