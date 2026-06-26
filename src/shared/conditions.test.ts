import { describe, expect, it } from 'vitest';
import {
  computeOnTrack,
  countMetConditions,
  evaluateCondition,
} from './conditions.js';

describe('evaluateCondition', () => {
  const ft = 'FT' as const;

  it('match 1: Senegal 1-goal win', () => {
    expect(evaluateCondition(1, 1, 0, ft)).toBe(true);
    expect(evaluateCondition(1, 2, 1, ft)).toBe(true);
  });

  it('match 1: Senegal 2-goal win fails', () => {
    expect(evaluateCondition(1, 2, 0, ft)).toBe(false);
  });

  it('match 1: Iraq win within 4 goals', () => {
    expect(evaluateCondition(1, 0, 1, ft)).toBe(true);
    expect(evaluateCondition(1, 1, 5, ft)).toBe(true);
  });

  it('match 1: Iraq 5-goal win fails', () => {
    expect(evaluateCondition(1, 0, 5, ft)).toBe(false);
  });

  it('match 1: draw fails', () => {
    expect(evaluateCondition(1, 1, 1, ft)).toBe(false);
  });

  it('match 2: Spain win', () => {
    expect(evaluateCondition(2, 0, 1, ft)).toBe(true);
    expect(evaluateCondition(2, 1, 2, ft)).toBe(true);
    expect(evaluateCondition(2, 1, 0, ft)).toBe(false);
  });

  it('match 3: Egypt win', () => {
    expect(evaluateCondition(3, 2, 1, ft)).toBe(true);
    expect(evaluateCondition(3, 0, 1, ft)).toBe(false);
  });

  it('match 4: Ghana win', () => {
    expect(evaluateCondition(4, 0, 2, ft)).toBe(true);
    expect(evaluateCondition(4, 2, 0, ft)).toBe(false);
  });

  it('match 5: Congo draw or loss', () => {
    expect(evaluateCondition(5, 1, 1, ft)).toBe(true);
    expect(evaluateCondition(5, 0, 1, ft)).toBe(true);
    expect(evaluateCondition(5, 2, 1, ft)).toBe(false);
  });

  it('match 6: Austria win or Algeria 2+ goal win', () => {
    expect(evaluateCondition(6, 0, 1, ft)).toBe(true);
    expect(evaluateCondition(6, 3, 1, ft)).toBe(true);
    expect(evaluateCondition(6, 2, 1, ft)).toBe(false);
    expect(evaluateCondition(6, 1, 1, ft)).toBe(false);
  });

  it('returns null when not finished', () => {
    expect(evaluateCondition(2, 0, 1, 'LIVE')).toBeNull();
    expect(evaluateCondition(2, null, null, 'NS')).toBeNull();
  });
});

describe('countMetConditions', () => {
  it('counts only true results', () => {
    const results = [
      { matchId: 1, conditionMet: true },
      { matchId: 2, conditionMet: false },
      { matchId: 3, conditionMet: null },
      { matchId: 4, conditionMet: true },
    ];
    expect(countMetConditions(results)).toBe(2);
  });
});

describe('computeOnTrack', () => {
  it('null until all finished', () => {
    expect(computeOnTrack(2, 5, 6, 3)).toBeNull();
  });

  it('true when enough met', () => {
    expect(computeOnTrack(3, 6, 6, 3)).toBe(true);
    expect(computeOnTrack(4, 6, 6, 3)).toBe(true);
  });

  it('false when not enough', () => {
    expect(computeOnTrack(2, 6, 6, 3)).toBe(false);
  });
});
