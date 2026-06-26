import { loadEnvFile } from '../src/server/load-env.js';
import { closeDb, getAllMatchStates, getAppMeta, getDb } from '../src/server/db/index.js';
import { seedMatches } from '../src/server/db/seed.js';
import { hasApiKey } from '../src/server/services/football-api.js';
import { resolveFixtures } from '../src/server/services/resolve-fixtures.js';

loadEnvFile();

async function main(): Promise<void> {
  if (!hasApiKey()) {
    console.error('API_FOOTBALL_KEY is not set in .env');
    process.exit(1);
  }

  getDb();
  if (getAllMatchStates().length === 0) {
    seedMatches();
  }

  console.log('Resolving and verifying fixtures...\n');
  await resolveFixtures();

  const states = getAllMatchStates();
  let ok = 0;
  let fail = 0;

  for (const state of states) {
    const mismatch = getAppMeta(`fixture_mismatch_${state.match_id}`);
    const error = getAppMeta(`fixture_error_${state.match_id}`);

    if (state.api_fixture_id && !mismatch && !error) {
      console.log(`  OK  match ${state.match_id}: fixture ${state.api_fixture_id}`);
      ok++;
    } else {
      console.log(
        `  FAIL match ${state.match_id}: fixture=${state.api_fixture_id ?? 'none'} mismatch=${mismatch ?? '-'} error=${error ?? '-'}`,
      );
      fail++;
    }
  }

  console.log(`\nResult: ${ok} ok, ${fail} failed (of ${states.length})`);
  closeDb();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  closeDb();
  process.exit(1);
});
