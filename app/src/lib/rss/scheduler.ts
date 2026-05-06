import cron, { ScheduledTask } from 'node-cron';
import { runFullIngest } from './engine';
import { generateDailyDigest } from '../services/digest';
import { invalidateDigestCache } from '../services/digest-cache';
import { initializeDatabase } from '../db/schema';

let feedTask: ScheduledTask | null = null;
let digestTask: ScheduledTask | null = null;
let bootstrapRan = false;

/**
 * 每 2 小时执行一次完整管道：抓取 → 翻译 → 分类 → 合成中文语音。
 * 日常运营的主节拍由这里统一驱动；手动 /api/feeds/fetch 复用 runFullIngest 保证行为一致。
 */
export function startFeedScheduler(): void {
  if (feedTask) return;
  console.log('[RSS Scheduler] Full-ingest scheduler started (every 2h)');
  feedTask = cron.schedule('0 */2 * * *', async () => {
    try {
      console.log('[RSS Scheduler] Running full ingest pipeline...');
      await runFullIngest();
    } catch (err) {
      console.error('[RSS Scheduler] runFullIngest error:', err);
    }
  });
}

export function startDigestScheduler(): void {
  if (digestTask) return;
  console.log('[RSS Scheduler] Digest scheduler started (08:00 & 20:00)');
  digestTask = cron.schedule('0 8,20 * * *', async () => {
    try {
      console.log('[RSS Scheduler] Generating digest...');
      await generateDailyDigest('zh');
      invalidateDigestCache();
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
      runFullIngest().catch((e) =>
        console.error('[RSS Scheduler] bootstrap runFullIngest error:', e)
      );
    }, 15_000);
  }
}
