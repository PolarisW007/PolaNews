import cron, { ScheduledTask } from 'node-cron';
import { fetchAllFeeds, translateUntranslatedArticles, classifyUnclassifiedArticles } from './engine';
import { generateDailyDigest } from '../services/digest';

let feedTask: ScheduledTask | null = null;
let digestTask: ScheduledTask | null = null;
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

async function runFeedPipeline(): Promise<void> {
  if (feedRunInProgress) {
    console.warn('[RSS Scheduler] Previous feed pipeline still running, skip this tick');
    return;
  }
  feedRunInProgress = true;
  try {
    console.log('[RSS Scheduler] Fetching feeds...');
    await withTimeout('fetchAllFeeds', fetchAllFeeds(), FEED_PIPELINE_TIMEOUT_MS);
    await withTimeout('translateUntranslatedArticles', translateUntranslatedArticles(50), FEED_PIPELINE_TIMEOUT_MS);
    await withTimeout('classifyUnclassifiedArticles', classifyUnclassifiedArticles(30), FEED_PIPELINE_TIMEOUT_MS);
  } finally {
    feedRunInProgress = false;
  }
}

async function runDigest(): Promise<void> {
  if (digestRunInProgress) {
    console.warn('[RSS Scheduler] Previous digest run still running, skip this tick');
    return;
  }
  digestRunInProgress = true;
  try {
    console.log('[RSS Scheduler] Generating digest...');
    await withTimeout('generateDailyDigest', generateDailyDigest('zh'), DIGEST_TIMEOUT_MS);
  } finally {
    digestRunInProgress = false;
  }
}

export function startFeedScheduler(): void {
  if (process.env.POLANEWS_SCHEDULER_DISABLED === '1') {
    console.log('[RSS Scheduler] Scheduler disabled by POLANEWS_SCHEDULER_DISABLED=1');
    return;
  }
  if (feedTask) return;
  console.log('[RSS Scheduler] Feed scheduler started (every 30 min)');
  feedTask = cron.schedule('*/30 * * * *', async () => {
    try {
      await runFeedPipeline();
    } catch (err) {
      console.error('[RSS Scheduler] feed pipeline error:', err);
    }
  });
}

export function startDigestScheduler(): void {
  if (process.env.POLANEWS_SCHEDULER_DISABLED === '1') return;
  if (digestTask) return;
  console.log('[RSS Scheduler] Digest scheduler started (08:00 & 20:00)');
  digestTask = cron.schedule('0 8,20 * * *', async () => {
    try {
      await runDigest();
    } catch (err) {
      console.error('[RSS Scheduler] generateDigests error:', err);
    }
  });
}

export function startAllSchedulers(): void {
  startFeedScheduler();
  startDigestScheduler();
}
