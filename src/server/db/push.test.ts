import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  deletePushSubscription,
  deletePushSubscriptionsByUserId,
  getAllPushSubscriptions,
  getDb,
  getPushSubscriptionsByUserId,
  upsertPushSubscription,
  upsertUser,
} from './index.js';

describe('push_subscriptions', () => {
  let tempDir: string;
  const originalPath = process.env.DATABASE_PATH;

  beforeEach(() => {
    closeDb();
    tempDir = mkdtempSync(join(tmpdir(), 'wc-db-push-'));
    process.env.DATABASE_PATH = join(tempDir, 'test.db');
    getDb();
  });

  afterEach(() => {
    closeDb();
    rmSync(tempDir, { recursive: true, force: true });
    if (originalPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalPath;
    }
  });

  it('upserts and lists subscriptions per user', () => {
    const user = upsertUser('kakao-push', 'enc');
    upsertPushSubscription({
      userId: user.id,
      endpoint: 'https://push.example/1',
      p256dh: 'key1',
      auth: 'auth1',
    });
    upsertPushSubscription({
      userId: user.id,
      endpoint: 'https://push.example/2',
      p256dh: 'key2',
      auth: 'auth2',
    });

    expect(getPushSubscriptionsByUserId(user.id)).toHaveLength(2);
    expect(getAllPushSubscriptions()).toHaveLength(2);
  });

  it('deletes by endpoint and by user', () => {
    const user = upsertUser('kakao-push-2', 'enc');
    upsertPushSubscription({
      userId: user.id,
      endpoint: 'https://push.example/a',
      p256dh: 'k',
      auth: 'a',
    });

    expect(deletePushSubscription('https://push.example/a')).toBe(true);
    expect(getPushSubscriptionsByUserId(user.id)).toHaveLength(0);

    upsertPushSubscription({
      userId: user.id,
      endpoint: 'https://push.example/b',
      p256dh: 'k',
      auth: 'a',
    });
    expect(deletePushSubscriptionsByUserId(user.id)).toBe(1);
  });
});
