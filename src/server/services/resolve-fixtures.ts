import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MatchConfig, MatchesFileConfig } from '../../shared/types.js';
import type { FixtureData } from '../../shared/types.js';
import {
  deleteAppMeta,
  getAllMatchStates,
  setAppMeta,
  upsertMatchState,
} from '../db/index.js';
import {
  fetchFixture,
  fetchFixturesByDate,
  hasApiKey,
} from './kickoff-api.js';
import {
  findFixtureForMatch,
  kickoffToApiQueryDates,
  verifyFixtureTeams,
} from './fixture-resolver.js';

function loadConfig(): MatchesFileConfig {
  const path = resolve(process.cwd(), 'config/matches.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as MatchesFileConfig;
}

function clearFixtureMeta(matchId: number): void {
  deleteAppMeta(`fixture_error_${matchId}`);
  deleteAppMeta(`fixture_mismatch_${matchId}`);
}

export async function resolveFixtures(): Promise<void> {
  if (!hasApiKey()) {
    console.warn(
      '[fixture-resolver] KICKOFF_API_KEY not set — skipping fixture resolution',
    );
    return;
  }

  const config = loadConfig();
  const states = getAllMatchStates();
  const stateMap = new Map(states.map((s) => [s.match_id, s]));

  for (const match of config.matches) {
    const state = stateMap.get(match.id);
    const existingId =
      state?.api_fixture_id ?? match.apiFixtureId ?? null;

    try {
      if (existingId) {
        await verifyExistingFixture(match, existingId);
        continue;
      }

      await resolveFixtureFromDate(match);
    } catch (err) {
      console.error(`[fixture-resolver] match ${match.id} failed:`, err);
      setAppMeta(`fixture_error_${match.id}`, String(err));
    }
  }
}

async function verifyExistingFixture(
  match: MatchConfig,
  fixtureId: number,
): Promise<void> {
  const fixture = await fetchFixture(fixtureId);
  if (!fixture) {
    console.error(
      `[fixture-resolver] match ${match.id}: fixture ${fixtureId} not found`,
    );
    setAppMeta(`fixture_mismatch_${match.id}`, 'fixture not found');
    return;
  }

  if (!verifyFixtureTeams(match, fixture)) {
    console.error(
      `[fixture-resolver] match ${match.id}: team mismatch for fixture ${fixtureId}`,
      `config=${match.homeTeam} vs ${match.awayTeam}`,
      `api=${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
    );
    setAppMeta(
      `fixture_mismatch_${match.id}`,
      `${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
    );
    return;
  }

  upsertMatchState({
    matchId: match.id,
    apiFixtureId: fixtureId,
    kickoffKst: match.kickoffKst,
  });
  clearFixtureMeta(match.id);
  console.log(
    `[fixture-resolver] match ${match.id} verified: fixture ${fixtureId} (${fixture.homeTeamName} vs ${fixture.awayTeamName})`,
  );
}

async function resolveFixtureFromDate(match: MatchConfig): Promise<void> {
  const dates = kickoffToApiQueryDates(match.kickoffKst);
  const fixturesById = new Map<number, FixtureData>();

  for (const date of dates) {
    for (const fixture of await fetchFixturesByDate(date)) {
      fixturesById.set(fixture.fixtureId, fixture);
    }
  }

  const found = findFixtureForMatch(match, [...fixturesById.values()]);

  if (!found) {
    console.error(
      `[fixture-resolver] match ${match.id}: no fixture on ${dates.join('/')} for ${match.homeTeam} vs ${match.awayTeam}`,
    );
    setAppMeta(`fixture_mismatch_${match.id}`, `not found on ${dates.join('/')}`);
    return;
  }

  upsertMatchState({
    matchId: match.id,
    apiFixtureId: found.fixtureId,
    kickoffKst: match.kickoffKst,
  });
  clearFixtureMeta(match.id);
  console.log(
    `[fixture-resolver] match ${match.id} resolved: fixture ${found.fixtureId} (${found.homeTeamName} vs ${found.awayTeamName})`,
  );
}
