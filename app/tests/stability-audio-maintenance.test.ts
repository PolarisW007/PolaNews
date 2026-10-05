import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AudioRetentionStore,
  StaleArticleAudioReference,
} from '../src/lib/services/audio-retention.ts';
import {
  getAudioRetentionCutoff,
  getAudioRetentionDays,
  resolveAudioDirectory,
  runAudioRetention,
  timingSafeTokenEqual,
// @ts-expect-error Node's built-in type-strip runner requires an explicit .ts extension.
} from '../src/lib/services/audio-retention.ts';

const OLD_FILE = '11111111-1111-4111-8111-111111111111.mp3';
const PROTECTED_FILE = '22222222-2222-4222-8222-222222222222.mp3';
const RECENT_FILE = '33333333-3333-4333-8333-333333333333.mp3';
const MISSING_FILE = '44444444-4444-4444-8444-444444444444.mp3';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('requires an absolute POLANEWS_AUDIO_DIR in production', () => {
  assert.throws(
    () => resolveAudioDirectory({ env: { NODE_ENV: 'production' }, cwd: '/srv/polanews/app' }),
    /POLANEWS_AUDIO_DIR/,
  );
  assert.throws(
    () => resolveAudioDirectory({
      env: { NODE_ENV: 'production', POLANEWS_AUDIO_DIR: './audio' },
      cwd: '/srv/polanews/app',
    }),
    /POLANEWS_AUDIO_DIR/,
  );
  assert.equal(
    resolveAudioDirectory({
      env: { NODE_ENV: 'production', POLANEWS_AUDIO_DIR: '/srv/polanews-runtime/audio' },
      cwd: '/srv/polanews/app',
    }),
    '/srv/polanews-runtime/audio',
  );
});

test('uses a bounded 30-day audio generation and retention window', () => {
  assert.equal(getAudioRetentionDays(undefined), 30);
  assert.equal(getAudioRetentionDays(''), 30);
  assert.equal(getAudioRetentionDays('not-a-number'), 30);
  assert.equal(getAudioRetentionDays(0), 1);
  assert.equal(getAudioRetentionDays(4_000), 3_650);
  assert.equal(getAudioRetentionDays('45'), 45);
  assert.equal(
    getAudioRetentionCutoff(new Date('2026-10-06T00:00:00.000Z'), 30).toISOString(),
    '2026-09-06T00:00:00.000Z',
  );
});

test('normal pending-audio generation is constrained to the retention cutoff', async () => {
  const source = await readFile(
    new URL('../src/lib/services/tts.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /const retentionCutoff = getAudioRetentionCutoff\(\);/);
  assert.match(source, /COALESCE\(published_at, created_at\) >= \$2/);
  assert.match(source, /\[limit, retentionCutoff\]/);
  assert.doesNotMatch(source, /promisify\(exec\)/);
  assert.match(source, /promisify\(execFile\)/);
});

test('dry-run and apply only remove expired UUID audio and repair article references', async () => {
  const audioDir = await mkdtemp(join(tmpdir(), 'polanews-audio-retention-'));
  const now = new Date('2026-10-06T00:00:00.000Z');
  const old = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const cleared: StaleArticleAudioReference[][] = [];

  try {
    for (const filename of [OLD_FILE, PROTECTED_FILE, RECENT_FILE, 'not-managed.mp3']) {
      await writeFile(join(audioDir, filename), Buffer.alloc(16));
    }
    await utimes(join(audioDir, OLD_FILE), old, old);
    await utimes(join(audioDir, PROTECTED_FILE), old, old);
    await utimes(join(audioDir, RECENT_FILE), recent, recent);
    await utimes(join(audioDir, 'not-managed.mp3'), old, old);

    const store: AudioRetentionStore = {
      async listBroadcastSegments() {
        return [[{ audio_url: `/api/tts/audio/${PROTECTED_FILE}` }]];
      },
      async listArticleAudioReferences() {
        return [
          { id: 'article-zh', audio_url: `/polanews/api/tts/audio/${OLD_FILE}` },
          { id: 'article-en', audio_url_en: `/api/tts/audio/${MISSING_FILE}` },
          { id: 'article-ja', audio_url_ja: `/api/tts/audio/${PROTECTED_FILE}` },
        ];
      },
      async clearArticleAudioReferences(references) {
        cleared.push(references);
        return references.length;
      },
    };

    const preview = await runAudioRetention({
      mode: 'dry-run',
      audioDir,
      retentionDays: 30,
      maxDeletes: 10,
      now,
    }, store);
    assert.equal(preview.selectedFileCount, 1);
    assert.equal(preview.selectedArticleReferenceCount, 1);
    assert.equal(preview.missingArticleReferenceCount, 1);
    assert.equal(preview.deletedFileCount, 0);
    assert.equal(preview.clearedArticleReferenceCount, 0);
    assert.equal(cleared.length, 0);
    assert.equal(await exists(join(audioDir, OLD_FILE)), true);

    const applied = await runAudioRetention({
      mode: 'apply',
      audioDir,
      retentionDays: 30,
      maxDeletes: 10,
      now,
      expectedSelectionFingerprint: preview.selectionFingerprint,
    }, store);
    assert.equal(applied.deletedFileCount, 1);
    assert.equal(applied.clearedArticleReferenceCount, 2);
    assert.equal(await exists(join(audioDir, OLD_FILE)), false);
    assert.equal(await exists(join(audioDir, PROTECTED_FILE)), true);
    assert.equal(await exists(join(audioDir, RECENT_FILE)), true);
    assert.equal(await exists(join(audioDir, 'not-managed.mp3')), true);
    assert.deepEqual(
      cleared[0].map((reference) => `${reference.id}:${reference.language}`).sort(),
      ['article-en:en', 'article-zh:zh'],
    );
  } finally {
    await rm(audioDir, { recursive: true, force: true });
  }
});

test('fails closed when the audio root is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'polanews-audio-missing-'));
  const store: AudioRetentionStore = {
    async listBroadcastSegments() { return []; },
    async listArticleAudioReferences() {
      return [{ id: 'article', audio_url: `/api/tts/audio/${MISSING_FILE}` }];
    },
    async clearArticleAudioReferences() {
      assert.fail('missing roots must not clear database references');
    },
  };
  try {
    await assert.rejects(
      runAudioRetention({ mode: 'dry-run', audioDir: join(root, 'not-mounted') }, store),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fails closed when an existing audio root is unexpectedly empty', async () => {
  const audioDir = await mkdtemp(join(tmpdir(), 'polanews-audio-empty-'));
  let cleared = false;
  const store: AudioRetentionStore = {
    async listBroadcastSegments() { return []; },
    async listArticleAudioReferences() {
      return [{ id: 'article', audio_url: `/api/tts/audio/${MISSING_FILE}` }];
    },
    async clearArticleAudioReferences() {
      cleared = true;
      return 1;
    },
  };
  try {
    await assert.rejects(
      runAudioRetention({ mode: 'dry-run', audioDir }, store),
      /directory is empty/,
    );
    assert.equal(cleared, false);
  } finally {
    await rm(audioDir, { recursive: true, force: true });
  }
});

test('apply rejects a candidate set that changed after dry-run', async () => {
  const audioDir = await mkdtemp(join(tmpdir(), 'polanews-audio-drift-'));
  const now = new Date('2026-10-06T00:00:00.000Z');
  const old = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const path = join(audioDir, OLD_FILE);
  const store: AudioRetentionStore = {
    async listBroadcastSegments() { return []; },
    async listArticleAudioReferences() { return []; },
    async clearArticleAudioReferences() { return 0; },
  };
  try {
    await writeFile(path, Buffer.alloc(16));
    await utimes(path, old, old);
    const preview = await runAudioRetention({ mode: 'dry-run', audioDir, now }, store);
    await writeFile(path, Buffer.alloc(32));
    await utimes(path, old, old);
    await assert.rejects(
      runAudioRetention({
        mode: 'apply',
        audioDir,
        now,
        expectedSelectionFingerprint: preview.selectionFingerprint,
      }, store),
      /selection changed/,
    );
    assert.equal(await exists(path), true);
  } finally {
    await rm(audioDir, { recursive: true, force: true });
  }
});

test('apply fingerprint also binds the database reference repair plan', async () => {
  const audioDir = await mkdtemp(join(tmpdir(), 'polanews-audio-reference-drift-'));
  const now = new Date('2026-10-06T00:00:00.000Z');
  const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const path = join(audioDir, RECENT_FILE);
  let references = [{ id: 'article', audio_url: `/api/tts/audio/${RECENT_FILE}` }];
  const store: AudioRetentionStore = {
    async listBroadcastSegments() { return []; },
    async listArticleAudioReferences() { return references; },
    async clearArticleAudioReferences() { return 0; },
  };
  try {
    await writeFile(path, Buffer.alloc(16));
    await writeFile(join(audioDir, PROTECTED_FILE), Buffer.alloc(16));
    await utimes(path, recent, recent);
    await utimes(join(audioDir, PROTECTED_FILE), recent, recent);
    const preview = await runAudioRetention({ mode: 'dry-run', audioDir, now }, store);
    await rm(path);
    references = [{ id: 'article', audio_url: `/api/tts/audio/${RECENT_FILE}` }];
    await assert.rejects(
      runAudioRetention({
        mode: 'apply',
        audioDir,
        now,
        expectedSelectionFingerprint: preview.selectionFingerprint,
      }, store),
      /selection changed/,
    );
  } finally {
    await rm(audioDir, { recursive: true, force: true });
  }
});

test('returns an in-progress result instead of overlapping retention runs', async () => {
  const audioDir = await mkdtemp(join(tmpdir(), 'polanews-audio-lock-'));
  let release!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const releasePromise = new Promise<void>((resolve) => { release = resolve; });
  const slowStore: AudioRetentionStore = {
    async listBroadcastSegments() {
      started();
      await releasePromise;
      return [];
    },
    async listArticleAudioReferences() { return []; },
    async clearArticleAudioReferences() { return 0; },
  };

  try {
    const first = runAudioRetention({ mode: 'dry-run', audioDir }, slowStore);
    await startedPromise;
    const second = await runAudioRetention({ mode: 'apply', audioDir }, slowStore);
    assert.equal(second.skipped, true);
    assert.equal(second.reason, 'in_progress');
    release();
    assert.equal((await first).skipped, false);
  } finally {
    release();
    await rm(audioDir, { recursive: true, force: true });
  }
});

test('ops tokens use constant-time digest comparison semantics', () => {
  assert.equal(timingSafeTokenEqual('configured-token', 'configured-token'), true);
  assert.equal(timingSafeTokenEqual('configured-token', 'wrong-token'), false);
  assert.equal(timingSafeTokenEqual('', ''), false);
});
