import {
  getMatchState,
  isMatchFinishedStatus,
  tryClaimKickoffNotification,
  type MatchRow,
} from '../db/index.js';
import { loadMatchesConfig } from './match-poller.js';
import { onMatchKickoff } from './notifier.js';

const activeTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function getKickoffDelayMs(kickoffKst: string, nowMs: number): number {
  return Math.max(0, new Date(kickoffKst).getTime() - nowMs);
}

export function shouldSkipKickoff(state: MatchRow | undefined): boolean {
  if (!state) return true;
  if (state.kickoff_notified === 1) return true;
  if (isMatchFinishedStatus(state.status)) return true;
  return false;
}

async function fireKickoff(matchId: number): Promise<void> {
  if (!tryClaimKickoffNotification(matchId)) return;
  await onMatchKickoff(matchId);
}

export function scheduleKickoffForMatch(
  matchId: number,
  kickoffKst: string,
  nowMs = Date.now(),
): void {
  const state = getMatchState(matchId);
  if (shouldSkipKickoff(state)) return;
  if (activeTimers.has(matchId)) return;

  const delay = getKickoffDelayMs(kickoffKst, nowMs);

  if (delay === 0) {
    void fireKickoff(matchId);
    return;
  }

  const timer = setTimeout(() => {
    activeTimers.delete(matchId);
    void fireKickoff(matchId);
  }, delay);
  activeTimers.set(matchId, timer);
  console.log(
    `[kickoff] match ${matchId}: notification in ${Math.round(delay / 60_000)} min`,
  );
}

export function startKickoffScheduler(): void {
  const config = loadMatchesConfig();
  for (const match of config.matches) {
    scheduleKickoffForMatch(match.id, match.kickoffKst);
  }
  console.log(`[kickoff] registered ${config.matches.length} matches`);
}

export function stopKickoffScheduler(): void {
  for (const timer of activeTimers.values()) clearTimeout(timer);
  activeTimers.clear();
}
