import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, deleteUser, getDb, upsertUser } from '../db/index.js';
import {
  getSubscriberStats,
  hashKakaoUserId,
  recordSubscriberFingerprint,
} from './subscriber-fingerprint.js';

describe('subscriber fingerprint', () => {
  let tempDir: string;
  const originalPath = process.env.DATABASE_PATH;
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    closeDb();
    tempDir = mkdtempSync(join(tmpdir(), 'wc-fp-test-'));
    process.env.DATABASE_PATH = join(tempDir, 'test.db');
    process.env.SESSION_SECRET = 'test-session-secret-for-fingerprint';
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
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  it('hashes kakao user id deterministically', () => {
    const a = hashKakaoUserId('12345');
    const b = hashKakaoUserId('12345');
    expect(a).toBe(b);
    expect(a).not.toBe(hashKakaoUserId('67890'));
  });

  it('counts unique subscribers and ignores re-subscribe', () => {
    expect(recordSubscriberFingerprint('kakao-a')).toEqual({
      isNew: true,
      uniqueSubscribers: 1,
    });
    expect(recordSubscriberFingerprint('kakao-a')).toEqual({
      isNew: false,
      uniqueSubscribers: 1,
    });
    expect(recordSubscriberFingerprint('kakao-b')).toEqual({
      isNew: true,
      uniqueSubscribers: 2,
    });
  });

  it('keeps unique count after user row is deleted', () => {
    const user = upsertUser('kakao-c', 'enc');
    recordSubscriberFingerprint('kakao-c');
    deleteUser(user.id);

    expect(getSubscriberStats()).toEqual({
      uniqueSubscribers: 1,
      activeSubscribers: 0,
    });
  });
});
