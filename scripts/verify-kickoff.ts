import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from '../src/server/load-env.js';
import {
  findFixtureForMatch,
  kickoffToApiQueryDates,
} from '../src/server/services/fixture-resolver.js';
import {
  fetchFixture,
  fetchFixturesByDate,
  getLastRateLimit,
  hasApiKey,
} from '../src/server/services/kickoff-api.js';
import type { FixtureData, MatchesFileConfig } from '../src/shared/types.js';

loadEnvFile();

const FINISHED = new Set(['FT', 'AET', 'PEN']);

function loadConfig(): MatchesFileConfig {
  const path = resolve(process.cwd(), 'config/matches.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as MatchesFileConfig;
}

function formatRateLimit(): string {
  const { limit, remaining, reset } = getLastRateLimit();
  const resetStr =
    reset !== null
      ? new Date(Number(reset) * 1000).toISOString()
      : 'unknown';
  return `Rate limit: ${remaining ?? '?'}/${limit ?? '?'} (resets ${resetStr})`;
}

async function testSeasonAccess(): Promise<boolean> {
  console.log('[Test 1] season=2026 date=2026-06-27');
  try {
    const fixtures = await fetchFixturesByDate('2026-06-27');
    if (fixtures.length === 0) {
      console.log('  FAIL — no fixtures returned');
      return false;
    }
    console.log(`  PASS (${fixtures.length} fixtures)`);
    console.log(`  ${formatRateLimit()}`);
    return true;
  } catch (err) {
    console.log(`  FAIL — ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function testTrackingMatches(
  config: MatchesFileConfig,
): Promise<{ ok: number; fail: number; fixtureIds: number[] }> {
  console.log('\n[Test 2] tracking matches');
  const dateCache = new Map<string, FixtureData[]>();
  let ok = 0;
  let fail = 0;
  const fixtureIds: number[] = [];

  for (const match of config.matches) {
    const dates = kickoffToApiQueryDates(match.kickoffKst);
    try {
      const fixturesById = new Map<number, FixtureData>();
      for (const date of dates) {
        if (!dateCache.has(date)) {
          dateCache.set(date, await fetchFixturesByDate(date));
        }
        for (const fixture of dateCache.get(date)!) {
          fixturesById.set(fixture.fixtureId, fixture);
        }
      }
      const found = findFixtureForMatch(match, [...fixturesById.values()]);

      if (!found) {
        console.log(
          `  FAIL match ${match.id}: not found on ${dates.join('/')} (${match.homeTeam} vs ${match.awayTeam})`,
        );
        fail++;
        continue;
      }

      console.log(
        `  OK  match ${match.id}: fixture ${found.fixtureId} (${found.homeTeamName} vs ${found.awayTeamName})`,
      );
      fixtureIds.push(found.fixtureId);
      ok++;
    } catch (err) {
      console.log(
        `  FAIL match ${match.id}: ${err instanceof Error ? err.message : err}`,
      );
      fail++;
    }
  }

  return { ok, fail, fixtureIds };
}

async function findFinishedFixture(
  dates: string[],
): Promise<FixtureData | null> {
  for (const date of dates) {
    const fixtures = await fetchFixturesByDate(date);
    const finished = fixtures.find((f) => FINISHED.has(f.statusShort));
    if (finished) return finished;
  }
  return null;
}

async function testFixtureById(
  fixtureIds: number[],
): Promise<boolean> {
  console.log('\n[Test 3] fixture by id');

  let targetId = fixtureIds[0] ?? null;
  let label = targetId !== null ? `from tracking match ${targetId}` : '';

  if (targetId === null) {
    console.log('  No tracking fixture — searching recent FT match...');
    const finished = await findFinishedFixture([
      '2026-06-26',
      '2026-06-25',
      '2026-06-24',
    ]);
    if (!finished) {
      console.log('  SKIP — no fixture ID available and no recent FT match');
      return true;
    }
    targetId = finished.fixtureId;
    label = `recent FT ${finished.homeTeamName} vs ${finished.awayTeamName}`;
  }

  try {
    const fixture = await fetchFixture(targetId);
    if (!fixture) {
      console.log(`  FAIL — fixture ${targetId} not found (${label})`);
      return false;
    }

    const score =
      fixture.homeScore !== null && fixture.awayScore !== null
        ? `${fixture.homeScore}-${fixture.awayScore}`
        : 'score pending';

    console.log(
      `  PASS fixture ${fixture.fixtureId} (${label}): status=${fixture.statusShort} ${score}`,
    );
    return true;
  } catch (err) {
    console.log(`  FAIL — ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('KickoffAPI verification\n');

  if (!hasApiKey()) {
    console.error('KICKOFF_API_KEY is not set in .env');
    process.exit(1);
  }

  const config = loadConfig();
  let passed = 0;
  let failed = 0;

  if (await testSeasonAccess()) {
    passed++;
  } else {
    failed++;
  }

  const tracking = await testTrackingMatches(config);
  if (tracking.fail === 0 && tracking.ok === config.matches.length) {
    passed++;
  } else {
    failed++;
  }

  if (await testFixtureById(tracking.fixtureIds)) {
    passed++;
  } else {
    failed++;
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
