import webpush from 'web-push';
import {
  deletePushSubscription,
  type PushSubscriptionRow,
} from '../db/index.js';

export function hasPushConfig(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

export function getVapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  if (!key) throw new Error('VAPID_PUBLIC_KEY not configured');
  return key.replace(/^["']|["']$/g, '');
}

let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const subject = process.env.VAPID_SUBJECT!.trim().replace(/^["']|["']$/g, '');
  const publicKey = process.env.VAPID_PUBLIC_KEY!.trim().replace(/^["']|["']$/g, '');
  const privateKey = process.env.VAPID_PRIVATE_KEY!.trim().replace(/^["']|["']$/g, '');
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export interface PushPayload {
  title: string;
  url: string;
}

export async function sendPushToSubscription(
  sub: PushSubscriptionRow,
  payload: PushPayload,
): Promise<void> {
  ensureVapidConfigured();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
    );
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      deletePushSubscription(sub.endpoint);
    }
    throw err;
  }
}
