#!/usr/bin/env -S node --experimental-strip-types

import { Pool } from 'pg';
import type {
  AudioRetentionStore,
  StaleArticleAudioReference,
} from '../src/lib/services/audio-retention.ts';
import {
  resolveAudioDirectory,
  runAudioRetention,
// @ts-expect-error Node's built-in type-strip runner requires an explicit .ts extension.
} from '../src/lib/services/audio-retention.ts';

function readNumber(name: string): number | undefined {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
}

const wantsDryRun = process.argv.includes('--dry-run');
const wantsApply = process.argv.includes('--apply');
if (wantsDryRun === wantsApply) {
  console.error('Usage: node --experimental-strip-types scripts/audio-retention.ts (--dry-run|--apply) [--days=N] [--limit=N] [--fingerprint=SHA256]');
  process.exit(2);
}

const fingerprint = process.argv
  .find((argument) => argument.startsWith('--fingerprint='))
  ?.slice('--fingerprint='.length);
if (wantsApply && !fingerprint) {
  console.error('--apply requires the selectionFingerprint from a matching --dry-run');
  process.exit(2);
}

const audioDir = resolveAudioDirectory({
  env: { ...process.env, NODE_ENV: 'production' },
});
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/worldoverview',
  max: 2,
});

const store: AudioRetentionStore = {
  async listBroadcastSegments() {
    const result = await pool.query<{ segments: unknown }>(
      `SELECT segments
       FROM broadcasts
       WHERE segments IS NOT NULL AND segments <> '[]'::jsonb`,
    );
    return result.rows.map((row) => row.segments);
  },

  async listArticleAudioReferences() {
    const result = await pool.query<{
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
    return result.rows;
  },

  async clearArticleAudioReferences(references: StaleArticleAudioReference[]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
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
      await client.query('COMMIT');
      return cleared;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

try {
  const result = await runAudioRetention({
    mode: wantsApply ? 'apply' : 'dry-run',
    audioDir,
    retentionDays: readNumber('days'),
    maxDeletes: readNumber('limit'),
    expectedSelectionFingerprint: fingerprint,
  }, store);
  console.log(JSON.stringify(result, null, 2));
  if (result.deleteFailureCount > 0) process.exitCode = 1;
} catch (error) {
  console.error('Audio retention failed:', error instanceof Error ? error.name : 'unknown');
  process.exitCode = 1;
} finally {
  await pool.end();
}
