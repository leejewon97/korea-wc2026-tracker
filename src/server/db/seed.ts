import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MatchConfig } from '../../shared/types.js';
import { closeDb, upsertMatchState } from './index.js';

interface MatchesFile {
  matches: MatchConfig[];
}

function loadMatchesConfig(): MatchConfig[] {
  const path = resolve(process.cwd(), 'config/matches.json');
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw) as MatchesFile;
  return data.matches;
}

export function seedMatches(): void {
  const matches = loadMatchesConfig();

  for (const match of matches) {
    upsertMatchState({
      matchId: match.id,
      apiFixtureId: match.apiFixtureId,
      kickoffKst: match.kickoffKst,
      homeScore: null,
      awayScore: null,
      conditionMet: null,
      status: 'NS',
      finishedAt: null,
      pollingStartedAt: null,
    });
  }

  console.log(`Seeded ${matches.length} matches.`);
}

const isCli = process.argv[1]?.replace(/\\/g, '/').endsWith('db/seed.ts');
if (isCli) {
  seedMatches();
  closeDb();
}
