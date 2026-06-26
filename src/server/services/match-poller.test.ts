import { describe, expect, it } from 'vitest';
import {
  computePollStartMs,
  isPollingComplete,
  shouldMarkPollFailed,
} from './match-poller.js';

describe('computePollStartMs', () => {
  it('adds startAfterMinutes to kickoff', () => {
    const kickoff = '2026-06-27T04:00:00+09:00';
    const start = computePollStartMs(kickoff, 110);
    const diff = start - new Date(kickoff).getTime();
    expect(diff).toBe(110 * 60_000);
  });
});

describe('shouldMarkPollFailed', () => {
  it('marks failed at max attempts when not finished', () => {
    expect(shouldMarkPollFailed(30, 30, false)).toBe(true);
    expect(shouldMarkPollFailed(29, 30, false)).toBe(false);
  });

  it('does not mark failed when finished', () => {
    expect(shouldMarkPollFailed(30, 30, true)).toBe(false);
  });
});

describe('isPollingComplete', () => {
  it('complete when finished', () => {
    expect(isPollingComplete({ status: 'FT', poll_failed: 0 })).toBe(true);
    expect(isPollingComplete({ status: 'MANUAL', poll_failed: 0 })).toBe(true);
  });

  it('complete when poll failed', () => {
    expect(isPollingComplete({ status: 'LIVE', poll_failed: 1 })).toBe(true);
  });

  it('not complete when still polling', () => {
    expect(isPollingComplete({ status: 'LIVE', poll_failed: 0 })).toBe(false);
  });
});
