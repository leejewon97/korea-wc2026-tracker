import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, recordVisitorPageView } from '../db/index.js';
import { getVisitorStats } from './visitor-analytics.js';

describe('visitor analytics', () => {
  let tempDir: string;
  const originalPath = process.env.DATABASE_PATH;
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    closeDb();
    tempDir = mkdtempSync(join(tmpdir(), 'wc-visitor-test-'));
    process.env.DATABASE_PATH = join(tempDir, 'test.db');
    process.env.SESSION_SECRET = 'test-session-secret-for-visitor';
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

  it('counts unique visitors and total page views', () => {
    expect(recordVisitorPageView('visitor-a')).toBe(true);
    expect(getVisitorStats()).toEqual({
      uniqueVisitors: 1,
      totalPageViews: 1,
    });

    expect(recordVisitorPageView('visitor-a')).toBe(false);
    expect(getVisitorStats()).toEqual({
      uniqueVisitors: 1,
      totalPageViews: 2,
    });

    expect(recordVisitorPageView('visitor-b')).toBe(true);
    expect(getVisitorStats()).toEqual({
      uniqueVisitors: 2,
      totalPageViews: 3,
    });
  });
});
