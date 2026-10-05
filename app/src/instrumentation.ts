export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAllSchedulers } = await import('./lib/rss/scheduler');
    const started = await startAllSchedulers();
    console.log(started
      ? '[Instrumentation] RSS, digest, and audio retention schedulers started'
      : '[Instrumentation] Scheduler startup disabled');
  }
}
