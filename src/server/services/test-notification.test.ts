import { describe, expect, it } from 'vitest';
import { detectMilestone } from '../../shared/conditions.js';
import {
  TEST_TRIGGER_MATCH_ID,
  buildFinalEliminationTestStatus,
} from './test-notification.js';

describe('test-notification', () => {
  it('builds final-match elimination scenario', () => {
    const status = buildFinalEliminationTestStatus();
    expect(status.metCount).toBe(2);
    expect(status.finishedCount).toBe(6);
    expect(
      detectMilestone(
        status.metCount,
        status.finishedCount,
        status.matches.length,
        status.requiredMetCount,
      ),
    ).toBe('eliminated_confirmed');

    expect(status.matches.find((m) => m.id === 1)?.conditionMet).toBe(true);
    expect(status.matches.find((m) => m.id === 5)?.conditionMet).toBe(true);
    expect(status.matches.find((m) => m.id === TEST_TRIGGER_MATCH_ID)).toMatchObject({
      group: 'J',
      homeScore: 1,
      awayScore: 0,
      status: 'FT',
      conditionMet: false,
    });
  });
});
