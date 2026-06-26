import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateCondition } from '../../shared/conditions.js';
import type { MatchesFileConfig, MatchStatus } from '../../shared/types.js';
import { getMatchState, upsertMatchState } from '../db/index.js';
import {
  fetchFixture,
  hasApiKey,
  isFinishedStatusShort,
  isGoalsConfirmed,
  mapApiStatusToMatchStatus,
} from './kickoff-api.js';
import { onMatchFinished } from './notifier.js';

export function loadMatchesConfig(): MatchesFileConfig {
  const path = resolve(process.cwd(), 'config/matches.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as MatchesFileConfig;
}

export function computePollStartMs(
  kickoffKst: string,
  startAfterMinutes: number,
): number {
  return new Date(kickoffKst).getTime() + startAfterMinutes * 60_000;
}

export function isPollingComplete(state: {
  status: string;
  poll_failed: number;
}): boolean {
  const finished = ['FT', 'AET', 'PEN', 'MANUAL'].includes(state.status);
  return finished || state.poll_failed === 1;
}

export function shouldMarkPollFailed(
  pollAttempts: number,
  maxAttempts: number,
  isFinished: boolean,
): boolean {
  return !isFinished && pollAttempts >= maxAttempts;
}

export async function pollMatchOnce(matchId: number): Promise<void> {
  if (!hasApiKey()) return;

  const state = getMatchState(matchId);
  if (!state || isPollingComplete(state)) return;

  const config = loadMatchesConfig();
  const { maxAttempts } = config.polling;
  const fixtureId = state.api_fixture_id;
  if (!fixtureId) return;

  const now = new Date().toISOString();
  const attempts = (state.poll_attempts ?? 0) + 1;

  try {
    const fixture = await fetchFixture(fixtureId);
    if (!fixture) {
      handleIncompletePoll(matchId, attempts, maxAttempts, now);
      return;
    }

    const finished =
      isFinishedStatusShort(fixture.statusShort) &&
      isGoalsConfirmed(fixture.homeScore, fixture.awayScore);

    if (finished) {
      const status = mapApiStatusToMatchStatus(
        fixture.statusShort,
      ) as MatchStatus;
      const conditionMet = evaluateCondition(
        matchId,
        fixture.homeScore,
        fixture.awayScore,
        status,
      );

      upsertMatchState({
        matchId,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        status,
        conditionMet,
        finishedAt: now,
        pollAttempts: attempts,
        pollFailed: false,
        lastPollAt: now,
      });
      onMatchFinished(matchId);
      console.log(
        `[match-poller] match ${matchId} finished: ${fixture.homeScore}-${fixture.awayScore}`,
      );
      return;
    }

    if (shouldMarkPollFailed(attempts, maxAttempts, false)) {
      upsertMatchState({
        matchId,
        status: 'LIVE',
        pollAttempts: attempts,
        pollFailed: true,
        lastPollAt: now,
        pollingStartedAt: state.polling_started_at ?? now,
      });
      console.warn(
        `[match-poller] match ${matchId}: poll failed after ${attempts} attempts`,
      );
      return;
    }

    upsertMatchState({
      matchId,
      status: mapApiStatusToMatchStatus(fixture.statusShort),
      pollAttempts: attempts,
      pollFailed: false,
      lastPollAt: now,
      pollingStartedAt: state.polling_started_at ?? now,
    });
  } catch (err) {
    console.error(`[match-poller] match ${matchId} poll error:`, err);
    handleIncompletePoll(matchId, attempts, maxAttempts, now);
  }
}

function handleIncompletePoll(
  matchId: number,
  attempts: number,
  maxAttempts: number,
  now: string,
): void {
  const state = getMatchState(matchId);
  if (shouldMarkPollFailed(attempts, maxAttempts, false)) {
    upsertMatchState({
      matchId,
      pollAttempts: attempts,
      pollFailed: true,
      lastPollAt: now,
      pollingStartedAt: state?.polling_started_at ?? now,
    });
    console.warn(
      `[match-poller] match ${matchId}: poll failed after ${attempts} attempts`,
    );
    return;
  }

  upsertMatchState({
    matchId,
    pollAttempts: attempts,
    lastPollAt: now,
    pollingStartedAt: state?.polling_started_at ?? now,
  });
}

const activeTimers = new Map<number, ReturnType<typeof setTimeout>>();
const activeIntervals = new Map<number, ReturnType<typeof setInterval>>();

export function startMatchPolling(matchId: number, kickoffKst: string): void {
  const config = loadMatchesConfig();
  const { startAfterMinutes, intervalMinutes, maxAttempts } = config.polling;

  const state = getMatchState(matchId);
  if (!state || isPollingComplete(state)) return;
  if (!state.api_fixture_id) return;

  if (activeTimers.has(matchId) || activeIntervals.has(matchId)) return;

  const pollStartMs = computePollStartMs(kickoffKst, startAfterMinutes);
  const nowMs = Date.now();
  const remainingAttempts = maxAttempts - (state.poll_attempts ?? 0);

  if (remainingAttempts <= 0) {
    if (!isPollingComplete(state)) {
      upsertMatchState({ matchId, pollFailed: true });
    }
    return;
  }

  const runPoll = () => {
    void pollMatchOnce(matchId).then(() => {
      const updated = getMatchState(matchId);
      if (!updated || isPollingComplete(updated)) {
        const interval = activeIntervals.get(matchId);
        if (interval) {
          clearInterval(interval);
          activeIntervals.delete(matchId);
        }
      }
    });
  };

  const startInterval = () => {
    runPoll();
    const interval = setInterval(runPoll, intervalMinutes * 60_000);
    activeIntervals.set(matchId, interval);
  };

  if (nowMs >= pollStartMs) {
    startInterval();
    return;
  }

  const delay = pollStartMs - nowMs;
  const timer = setTimeout(() => {
    activeTimers.delete(matchId);
    startInterval();
  }, delay);
  activeTimers.set(matchId, timer);
  console.log(
    `[scheduler] match ${matchId}: polling starts in ${Math.round(delay / 60_000)} min`,
  );
}

export function startScheduler(): void {
  if (!hasApiKey()) {
    console.warn('[scheduler] KICKOFF_API_KEY not set — polling disabled');
    return;
  }

  const config = loadMatchesConfig();
  for (const match of config.matches) {
    startMatchPolling(match.id, match.kickoffKst);
  }
  console.log(`[scheduler] registered ${config.matches.length} matches`);
}

export function stopScheduler(): void {
  for (const timer of activeTimers.values()) clearTimeout(timer);
  for (const interval of activeIntervals.values()) clearInterval(interval);
  activeTimers.clear();
  activeIntervals.clear();
}
