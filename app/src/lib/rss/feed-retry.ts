export const FEED_RETRY_BASE_MS = 15 * 60 * 1000;
export const FEED_RETRY_MAX_MS = 24 * 60 * 60 * 1000;

/** Calculate bounded exponential backoff for consecutive feed failures. */
export function calculateFeedRetryDelayMs(consecutiveFailures: number): number {
  const failures = Math.max(1, Math.trunc(consecutiveFailures));
  const exponent = Math.min(failures - 1, 16);
  return Math.min(FEED_RETRY_BASE_MS * (2 ** exponent), FEED_RETRY_MAX_MS);
}

export function calculateNextFeedRetryAt(
  consecutiveFailures: number,
  now: Date = new Date()
): Date {
  return new Date(now.getTime() + calculateFeedRetryDelayMs(consecutiveFailures));
}

/**
 * Scheduled runs include active feeds plus errored feeds whose retry window is due.
 * Manual runs can force all active/error feeds while paused feeds remain untouched.
 */
export function buildFeedSelectionClause(includeErrored: boolean): string {
  if (includeErrored) {
    return "status IN ('active', 'error')";
  }
  return "(status = 'active' OR (status = 'error' AND (next_retry_at IS NULL OR next_retry_at <= NOW())))";
}
