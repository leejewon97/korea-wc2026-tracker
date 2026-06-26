import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const onMatchKickoff = vi.fn().mockResolvedValue(undefined);
vi.mock('./notifier.js', () => ({
  onMatchKickoff: (...args: unknown[]) => onMatchKickoff(...args),
}));

import {
  closeDb,
  getDb,
  tryClaimKickoffNotification,
  upsertMatchState,
} from '../db/index.js';
import {
  getKickoffDelayMs,
  scheduleKickoffForMatch,
  shouldSkipKickoff,
  stopKickoffScheduler,
} from './kickoff-scheduler.js';

const KICKOFF = '2026-06-27T04:00:00+09:00';

describe('getKickoffDelayMs', () => {
  it('returns 0 when kickoff has passed', () => {
    const now = new Date(KICKOFF).getTime() + 1000;
    expect(getKickoffDelayMs(KICKOFF, now)).toBe(0);
  });

  it('returns positive delay before kickoff', () => {
    const now = new Date(KICKOFF).getTime() - 5 * 60_000;
    expect(getKickoffDelayMs(KICKOFF, now)).toBe(5 * 60_000);
  });
});

describe('shouldSkipKickoff', () => {
  it('skips when state is missing', () => {
    expect(shouldSkipKickoff(undefined)).toBe(true);
  });

  it('skips when already notified', () => {
    expect(
      shouldSkipKickoff({
        match_id: 1,
        kickoff_notified: 1,
        status: 'NS',
      } as never),
    ).toBe(true);
  });

  it('skips when match is finished', () => {
    expect(
      shouldSkipKickoff({
        match_id: 1,
        kickoff_notified: 0,
        status: 'FT',
      } as never),
    ).toBe(true);
  });

  it('does not skip pending match', () => {
    expect(
      shouldSkipKickoff({
        match_id: 1,
        kickoff_notified: 0,
        status: 'NS',
      } as never),
    ).toBe(false);
  });
});

describe('scheduleKickoffForMatch', () => {
  let tempDir: string;
  const originalPath = process.env.DATABASE_PATH;

  beforeEach(() => {
    onMatchKickoff.mockClear();
    closeDb();
    tempDir = mkdtempSync(join(tmpdir(), 'wc-kickoff-test-'));
    process.env.DATABASE_PATH = join(tempDir, 'test.db');
    getDb();
    upsertMatchState({
      matchId: 1,
      kickoffKst: KICKOFF,
      status: 'NS',
    });
  });

  afterEach(() => {
    stopKickoffScheduler();
    vi.useRealTimers();
    closeDb();
    rmSync(tempDir, { recursive: true, force: true });
    if (originalPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalPath;
    }
  });

  it('fires immediately when kickoff has passed', async () => {
    const now = new Date(KICKOFF).getTime() + 1000;
    scheduleKickoffForMatch(1, KICKOFF, now);
    await vi.waitFor(() => expect(onMatchKickoff).toHaveBeenCalledWith(1));
  });

  it('skips when already notified', () => {
    tryClaimKickoffNotification(1);
    const now = new Date(KICKOFF).getTime() + 1000;
    scheduleKickoffForMatch(1, KICKOFF, now);
    expect(onMatchKickoff).not.toHaveBeenCalled();
  });

  it('skips when match is finished', () => {
    upsertMatchState({ matchId: 1, status: 'FT', homeScore: 1, awayScore: 0 });
    const now = new Date(KICKOFF).getTime() + 1000;
    scheduleKickoffForMatch(1, KICKOFF, now);
    expect(onMatchKickoff).not.toHaveBeenCalled();
  });

  it('schedules timer before kickoff', async () => {
    vi.useFakeTimers();
    const now = new Date(KICKOFF).getTime() - 10 * 60_000;
    scheduleKickoffForMatch(1, KICKOFF, now);
    expect(onMatchKickoff).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(onMatchKickoff).toHaveBeenCalledWith(1);
  });
});
