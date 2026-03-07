import { Queue, Worker } from 'bullmq';
import { getRedis } from './redis';

const connection = { lazyConnect: true };

let feedQueue: Queue | null = null;
let classifyQueue: Queue | null = null;
let digestQueue: Queue | null = null;

export function getFeedQueue(): Queue {
  if (!feedQueue) {
    feedQueue = new Queue('feed-fetch', { connection: getRedis() });
  }
  return feedQueue;
}

export function getClassifyQueue(): Queue {
  if (!classifyQueue) {
    classifyQueue = new Queue('article-classify', { connection: getRedis() });
  }
  return classifyQueue;
}

export function getDigestQueue(): Queue {
  if (!digestQueue) {
    digestQueue = new Queue('digest-generate', { connection: getRedis() });
  }
  return digestQueue;
}

export function startWorkers(): void {
  const redis = getRedis();

  new Worker('feed-fetch', async (job) => {
    const { fetchAllFeeds, translateUntranslatedArticles, classifyUnclassifiedArticles } = await import('../rss/engine');
    console.log('[Worker] Fetching feeds...');
    await fetchAllFeeds();
    await translateUntranslatedArticles(50).catch(e => console.error('[Worker] Translation error:', e));
    await classifyUnclassifiedArticles(30).catch(e => console.error('[Worker] Classification error:', e));
  }, { connection: redis, concurrency: 1 });

  new Worker('digest-generate', async (job) => {
    const { generateDailyDigest } = await import('../services/digest');
    const lang = job.data?.lang || 'zh';
    console.log(`[Worker] Generating digest (${lang})...`);
    await generateDailyDigest(lang);
  }, { connection: redis, concurrency: 1 });

  console.log('[BullMQ] Workers started');
}
