import { getCookie } from 'hono/cookie';
import { Hono } from 'hono';
import {
  deletePushSubscriptionsByUserId,
  getPushSubscriptionsByUserId,
  getUserById,
  upsertPushSubscription,
} from '../db/index.js';
import { getVapidPublicKey, hasPushConfig } from '../services/push.js';
import { parseSessionToken, SESSION_COOKIE } from '../services/session.js';

export const pushRoutes = new Hono();

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return secret;
}

pushRoutes.get('/push/vapid-public-key', (c) => {
  if (!hasPushConfig()) {
    return c.json({ enabled: false });
  }
  return c.json({ enabled: true, publicKey: getVapidPublicKey() });
});

pushRoutes.post('/push/subscribe', async (c) => {
  if (!hasPushConfig()) {
    return c.json({ error: 'Push not configured' }, 503);
  }

  const session = parseSessionToken(
    getCookie(c, SESSION_COOKIE),
    getSessionSecret(),
  );
  if (!session) {
    return c.json({ error: 'Not logged in' }, 401);
  }

  const user = getUserById(session.userId);
  if (!user) {
    return c.json({ error: 'Not subscribed' }, 401);
  }

  const body = await c.req.json<{
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  }>();

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: 'Invalid subscription' }, 400);
  }

  upsertPushSubscription({
    userId: user.id,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
  });

  return c.json({ ok: true });
});

pushRoutes.delete('/push/unsubscribe', (c) => {
  if (!hasPushConfig()) {
    return c.json({ error: 'Push not configured' }, 503);
  }

  const session = parseSessionToken(
    getCookie(c, SESSION_COOKIE),
    getSessionSecret(),
  );
  if (!session) {
    return c.json({ error: 'Not logged in' }, 401);
  }

  deletePushSubscriptionsByUserId(session.userId);
  return c.json({ ok: true });
});

export function userHasPushSubscription(userId: number): boolean {
  return getPushSubscriptionsByUserId(userId).length > 0;
}
