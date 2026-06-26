import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  consumeOAuthState,
  deleteUser,
  getAllUsers,
  getDb,
  insertNotificationLog,
  saveOAuthState,
  upsertUser,
} from './index.js';

describe('deleteUser', () => {
  let tempDir: string;
  const originalPath = process.env.DATABASE_PATH;

  beforeEach(() => {
    closeDb();
    tempDir = mkdtempSync(join(tmpdir(), 'wc-db-test-'));
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

  it('deletes user after notification_log rows exist', () => {
    const user = upsertUser('kakao-123', 'enc-token');
    insertNotificationLog({
      userId: user.id,
      channel: 'kakao_memo',
      notificationHash: 'abc',
      payloadSummary: 'test',
      success: true,
    });

    expect(deleteUser(user.id)).toBe(true);
    expect(getAllUsers()).toHaveLength(0);
  });
});

describe('oauth state', () => {
  let tempDir: string;
  const originalPath = process.env.DATABASE_PATH;

  beforeEach(() => {
    closeDb();
    tempDir = mkdtempSync(join(tmpdir(), 'wc-db-test-'));
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

  it('consumes a saved state once', () => {
    saveOAuthState('state-abc');
    expect(consumeOAuthState('state-abc')).toBe(true);
    expect(consumeOAuthState('state-abc')).toBe(false);
  });
});
