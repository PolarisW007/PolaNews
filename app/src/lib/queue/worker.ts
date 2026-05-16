import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { getRedis } from './redis';

let feedQueue: Queue | null = null;
let classifyQueue: Queue | null = null;
let digestQueue: Queue | null = null;

function getConnection(): ConnectionOptions {
  return getRedis() as unknown as ConnectionOptions;
}

export function getFeedQueue(): Queue {
  if (!feedQueue) {
    feedQueue = new Queue('feed-fetch', { connection: getConnection() });
  }
  return feedQueue;
}

export function getClassifyQueue(): Queue {
  if (!classifyQueue) {
    classifyQueue = new Queue('article-classify', { connection: getConnection() });
  }
  return classifyQueue;
}

export function getDigestQueue(): Queue {
  if (!digestQueue) {
    digestQueue = new Queue('digest-generate', { connection: getConnection() });
  }
  return digestQueue;
}

export function startWorkers(): void {
  const conn = getConnection();

  new Worker('feed-fetch', async () => {
    const {
      fetchAllFeeds,
      translateUntranslatedArticles,
      summarizeMissingChineseArticles,
      classifyUnclassifiedArticles,
    } = await import('../rss/engine');
    console.log('[Worker] Fetching feeds...');
    await fetchAllFeeds();
    await translateUntranslatedArticles(50).catch(e => console.error('[Worker] Translation error:', e));
    await summarizeMissingChineseArticles(30).catch(e => console.error('[Worker] Summary error:', e));
    await classifyUnclassifiedArticles(30).catch(e => console.error('[Worker] Classification error:', e));
  }, { connection: conn, concurrency: 1 });

  new Worker('digest-generate', async (job) => {
    const { generateDailyDigest } = await import('../services/digest');
    const lang = job.data?.lang || 'zh';
    console.log(`[Worker] Generating digest (${lang})...`);
    await generateDailyDigest(lang);
  }, { connection: conn, concurrency: 1 });

  console.log('[BullMQ] Workers started');
}
