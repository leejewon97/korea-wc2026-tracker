import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeDb,
  getAllPushSubscriptions,
  getAllUsers,
  getDb,
  upsertPushSubscription,
  upsertUser,
} from '../db/index.js';
import { unsubscribeUser } from './unsubscribe-user.js';

vi.mock('./kakao.js', () => ({
  unlinkWithRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./token-crypto.js', () => ({
  decryptToken: vi.fn().mockReturnValue('refresh-token'),
}));

describe('unsubscribeUser', () => {
  let tempDir: string;
  const originalPath = process.env.DATABASE_PATH;

  beforeEach(() => {
    closeDb();
    tempDir = mkdtempSync(join(tmpdir(), 'wc-unsub-'));
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

  it('removes user and push subscriptions', async () => {
    const user = upsertUser('kakao-unsub', 'enc');
    upsertPushSubscription({
      userId: user.id,
      endpoint: 'https://push.example/end',
      p256dh: 'key',
      auth: 'secret',
    });

    expect(await unsubscribeUser(user)).toBe(true);
    expect(getAllUsers()).toHaveLength(0);
    expect(getAllPushSubscriptions()).toHaveLength(0);
  });
});
