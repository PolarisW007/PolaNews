import cron, { ScheduledTask } from 'node-cron';
import { fetchAllFeeds, translateUntranslatedArticles, classifyUnclassifiedArticles } from './engine';
import { generateDailyDigest } from '../services/digest';

let feedTask: ScheduledTask | null = null;
let digestTask: ScheduledTask | null = null;

export function startFeedScheduler(): void {
  if (feedTask) return;
  console.log('[RSS Scheduler] Feed scheduler started (every 30 min)');
  feedTask = cron.schedule('*/30 * * * *', async () => {
    try {
      console.log('[RSS Scheduler] Fetching feeds...');
      await fetchAllFeeds();
      translateUntranslatedArticles(50).catch(e =>
        console.error('[RSS Scheduler] Background translation error:', e)
      );
      classifyUnclassifiedArticles(30).catch(e =>
        console.error('[RSS Scheduler] Background classification error:', e)
      );
    } catch (err) {
      console.error('[RSS Scheduler] fetchAllFeeds error:', err);
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
    } catch (err) {
      console.error('[RSS Scheduler] generateDigests error:', err);
    }
  });
}

export function startAllSchedulers(): void {
  startFeedScheduler();
  startDigestScheduler();
}
