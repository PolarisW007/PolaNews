import cron, { ScheduledTask } from 'node-cron';
import { runFullIngest } from './engine';
import { generateDailyDigest } from '../services/digest';
import { invalidateDigestCache } from '../services/digest-cache';
import { initializeDatabase } from '../db/schema';
import { runConfiguredAudioRetention } from '../services/tts';

let feedTask: ScheduledTask | null = null;
let digestTask: ScheduledTask | null = null;
let audioRetentionTask: ScheduledTask | null = null;
let bootstrapRan = false;
let feedRunInProgress = false;
let digestRunInProgress = false;
let audioRetentionRunInProgress = false;

const FEED_PIPELINE_TIMEOUT_MS = Number(process.env.POLANEWS_FEED_PIPELINE_TIMEOUT_MS ?? 25 * 60 * 1000);
const DIGEST_TIMEOUT_MS = Number(process.env.POLANEWS_DIGEST_TIMEOUT_MS ?? 10 * 60 * 1000);

async function withTimeout<T>(label: string, promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runLockedFeedPipeline(source: string): Promise<void> {
  if (feedRunInProgress) {
    console.warn(`[RSS Scheduler] Previous full ingest still running, skip ${source}`);
    return;
  }
  feedRunInProgress = true;
  const operation = runFullIngest();
  void operation.then(
    () => { feedRunInProgress = false; },
    () => { feedRunInProgress = false; },
  );
  await withTimeout(`runFullIngest:${source}`, operation, FEED_PIPELINE_TIMEOUT_MS);
}

async function runLockedDigest(): Promise<void> {
  if (digestRunInProgress) {
    console.warn('[RSS Scheduler] Previous digest run still running, skip this tick');
    return;
  }
  digestRunInProgress = true;
  const operation = generateDailyDigest('zh');
  void operation.then(
    () => { digestRunInProgress = false; },
    () => { digestRunInProgress = false; },
  );
  await withTimeout('generateDailyDigest', operation, DIGEST_TIMEOUT_MS);
  invalidateDigestCache();
}

async function runLockedAudioRetention(): Promise<void> {
  if (audioRetentionRunInProgress) {
    console.warn('[RSS Scheduler] Previous audio retention run still active, skip this tick');
    return;
  }
  audioRetentionRunInProgress = true;
  try {
    const now = new Date();
    const options = {
      retentionDays: Number(process.env.POLANEWS_AUDIO_RETENTION_DAYS || 30),
      maxDeletes: Number(process.env.POLANEWS_AUDIO_RETENTION_BATCH_SIZE || 1_000),
      now,
    };
    const preview = await runConfiguredAudioRetention({
      ...options,
      mode: 'dry-run',
    });
    if (preview.skipped) {
      console.warn('[RSS Scheduler] Audio retention preview skipped', { reason: preview.reason });
      return;
    }
    const result = await runConfiguredAudioRetention({
      ...options,
      mode: 'apply',
      expectedSelectionFingerprint: preview.selectionFingerprint,
    });
    console.log('[RSS Scheduler] Audio retention completed', {
      skipped: result.skipped,
      managed: result.managedFileCount,
      eligible: result.eligibleFileCount,
      deleted: result.deletedFileCount,
      clearedReferences: result.clearedArticleReferenceCount,
      failures: result.deleteFailureCount,
    });
  } finally {
    audioRetentionRunInProgress = false;
  }
}

/**
 * 每 2 小时执行一次完整管道：抓取 → 翻译 → 分类 → 合成中文语音。
 * 日常运营的主节拍由这里统一驱动；手动 /api/feeds/fetch 复用 runFullIngest 保证行为一致。
 */
export function startFeedScheduler(): void {
  if (process.env.POLANEWS_SCHEDULER_DISABLED === '1') {
    console.log('[RSS Scheduler] Scheduler disabled by POLANEWS_SCHEDULER_DISABLED=1');
    return;
  }
  if (feedTask) return;
  console.log('[RSS Scheduler] Full-ingest scheduler started (every 2h)');
  feedTask = cron.schedule('0 */2 * * *', async () => {
    try {
      console.log('[RSS Scheduler] Running full ingest pipeline...');
      await runLockedFeedPipeline('cron');
    } catch (err) {
      console.error('[RSS Scheduler] runFullIngest error:', err);
    }
  });
}

export function startDigestScheduler(): void {
  if (process.env.POLANEWS_SCHEDULER_DISABLED === '1') return;
  if (digestTask) return;
  console.log('[RSS Scheduler] Digest scheduler started (08:00 & 20:00)');
  digestTask = cron.schedule('0 8,20 * * *', async () => {
    try {
      console.log('[RSS Scheduler] Generating digest...');
      await runLockedDigest();
    } catch (err) {
      console.error('[RSS Scheduler] generateDigests error:', err);
    }
  });
}

export function startAudioRetentionScheduler(): void {
  if (process.env.POLANEWS_SCHEDULER_DISABLED === '1') return;
  if (audioRetentionTask) return;
  console.log('[RSS Scheduler] Audio retention scheduler started (daily 03:30 Asia/Shanghai)');
  audioRetentionTask = cron.schedule('30 3 * * *', async () => {
    try {
      await runLockedAudioRetention();
    } catch (err) {
      console.error('[RSS Scheduler] audio retention failed:', err instanceof Error ? err.name : 'unknown');
    }
  }, { timezone: 'Asia/Shanghai' });
}

export async function startAllSchedulers(): Promise<boolean> {
  await initializeDatabase();
  if (process.env.POLANEWS_SCHEDULER_DISABLED === '1') {
    console.log('[RSS Scheduler] All schedulers and bootstrap disabled by POLANEWS_SCHEDULER_DISABLED=1');
    return false;
  }
  startFeedScheduler();
  startDigestScheduler();
  startAudioRetentionScheduler();

  // 启动时异步触发一次管道，追平服务重启间的空窗期；失败不影响主线程。
  if (!bootstrapRan) {
    bootstrapRan = true;
    setTimeout(() => {
      runLockedFeedPipeline('bootstrap').catch((e) =>
        console.error('[RSS Scheduler] bootstrap runFullIngest error:', e)
      );
    }, 15_000);
  }
  return true;
}
