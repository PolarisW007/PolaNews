import { query, execute } from '../db/schema';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@worldoverview.app';

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export async function subscribePush(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<void> {
  await execute(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = $3, auth = $4`,
    [userId, endpoint, p256dh, auth]
  );
}

export async function unsubscribePush(userId: string, endpoint: string): Promise<void> {
  await execute(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [userId, endpoint]
  );
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID keys not configured');
    return 0;
  }

  const webpush = await import('web-push');
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const subs = await query<{ endpoint: string; p256dh: string; auth: string }>(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url: url || '/' })
      );
      sent++;
    } catch (e) {
      const err = e as { statusCode?: number };
      if (err.statusCode === 410 || err.statusCode === 404) {
        await execute('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
      }
    }
  }
  return sent;
}

export async function broadcastPushNotification(
  title: string,
  body: string,
  url?: string
): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return 0;

  const userIds = await query<{ user_id: string }>(
    'SELECT DISTINCT user_id FROM push_subscriptions'
  );

  let total = 0;
  for (const { user_id } of userIds) {
    total += await sendPushNotification(user_id, title, body, url);
  }
  return total;
}
