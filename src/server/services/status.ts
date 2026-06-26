import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeOnTrack,
  countMetConditions,
  evaluateCondition,
} from '../../shared/conditions.js';
import {
  CONDITION_REQUIREMENTS,
  REQUIRED_MET_COUNT,
  type MatchConfig,
  type StatusResponse,
} from '../../shared/types.js';
import { getAllMatchStates } from '../db/index.js';

interface MatchesFile {
  requiredMetCount: number;
  matches: MatchConfig[];
}

function loadConfig(): MatchesFile {
  const path = resolve(process.cwd(), 'config/matches.json');
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as MatchesFile;
}

function requirementFor(matchId: number): string {
  return (
    CONDITION_REQUIREMENTS.find((r) => r.matchId === matchId)?.description ??
    ''
  );
}

export function buildStatusResponse(): StatusResponse {
  const config = loadConfig();
  const states = getAllMatchStates();
  const stateMap = new Map(states.map((s) => [s.match_id, s]));

  const matchResults = config.matches.map((match) => {
    const state = stateMap.get(match.id);
    const homeScore = state?.home_score ?? null;
    const awayScore = state?.away_score ?? null;
    const status = state?.status ?? 'NS';

    const conditionMet =
      state?.condition_met === null || state?.condition_met === undefined
        ? evaluateCondition(match.id, homeScore, awayScore, status)
        : state.condition_met === 1;

    return {
      ...match,
      apiFixtureId: state?.api_fixture_id ?? match.apiFixtureId ?? null,
      homeScore,
      awayScore,
      conditionMet,
      status,
      requirement: requirementFor(match.id),
      finishedAt: state?.finished_at ?? null,
      pollFailed: (state?.poll_failed ?? 0) === 1,
    };
  });

  const metCount = countMetConditions(
    matchResults.map((m) => ({ matchId: m.id, conditionMet: m.conditionMet })),
  );
  const finishedCount = matchResults.filter((m) =>
    ['FT', 'AET', 'PEN', 'MANUAL'].includes(m.status),
  ).length;

  const required = config.requiredMetCount ?? REQUIRED_MET_COUNT;

  return {
    updatedAt: new Date().toISOString(),
    serverTime: new Date().toISOString(),
    requiredMetCount: required,
    metCount,
    finishedCount,
    onTrack: computeOnTrack(
      metCount,
      finishedCount,
      matchResults.length,
      required,
    ),
    matches: matchResults,
  };
}
