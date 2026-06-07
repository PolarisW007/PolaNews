import cron, { ScheduledTask } from 'node-cron';
import { runFullIngest } from './engine';
import { generateDailyDigest } from '../services/digest';
import { invalidateDigestCache } from '../services/digest-cache';
import { initializeDatabase } from '../db/schema';

let feedTask: ScheduledTask | null = null;
let digestTask: ScheduledTask | null = null;
let bootstrapRan = false;
let feedRunInProgress = false;
let digestRunInProgress = false;

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
  try {
    await withTimeout(`runFullIngest:${source}`, runFullIngest(), FEED_PIPELINE_TIMEOUT_MS);
  } finally {
    feedRunInProgress = false;
  }
}

async function runLockedDigest(): Promise<void> {
  if (digestRunInProgress) {
    console.warn('[RSS Scheduler] Previous digest run still running, skip this tick');
    return;
  }
  digestRunInProgress = true;
  try {
    await withTimeout('generateDailyDigest', generateDailyDigest('zh'), DIGEST_TIMEOUT_MS);
    invalidateDigestCache();
  } finally {
    digestRunInProgress = false;
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

export async function startAllSchedulers(): Promise<void> {
  await initializeDatabase();
  startFeedScheduler();
  startDigestScheduler();

  // 启动时异步触发一次管道，追平服务重启间的空窗期；失败不影响主线程。
  if (!bootstrapRan) {
    bootstrapRan = true;
    setTimeout(() => {
      runLockedFeedPipeline('bootstrap').catch((e) =>
        console.error('[RSS Scheduler] bootstrap runFullIngest error:', e)
      );
    }, 15_000);
  }
}
