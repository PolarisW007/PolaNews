export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAllSchedulers } = await import('./lib/rss/scheduler');
    startAllSchedulers();
    console.log('[Instrumentation] RSS & Digest schedulers started');
  }
}
