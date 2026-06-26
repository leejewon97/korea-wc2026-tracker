import type { MatchConfig } from '../../shared/types.js';
import type { FixtureData } from '../../shared/types.js';

const TEAM_ALIASES: Record<string, string[]> = {
  senegal: ['senegal'],
  iraq: ['iraq'],
  uruguay: ['uruguay'],
  spain: ['spain'],
  egypt: ['egypt'],
  iran: ['iran', 'iran ir'],
  croatia: ['croatia'],
  ghana: ['ghana'],
  'congo dr': ['congo dr', 'dr congo', 'congo', 'democratic republic of the congo'],
  uzbekistan: ['uzbekistan'],
  algeria: ['algeria'],
  austria: ['austria'],
};

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function teamsMatch(configName: string, apiName: string): boolean {
  const normConfig = normalizeTeamName(configName);
  const normApi = normalizeTeamName(apiName);

  if (normConfig === normApi) return true;
  if (normApi.includes(normConfig) || normConfig.includes(normApi)) return true;

  const aliases = TEAM_ALIASES[normConfig] ?? [normConfig];
  return aliases.some(
    (alias) =>
      normApi === alias ||
      normApi.includes(alias) ||
      alias.includes(normApi),
  );
}

export function verifyFixtureTeams(
  match: Pick<MatchConfig, 'homeTeam' | 'awayTeam'>,
  fixture: Pick<FixtureData, 'homeTeamName' | 'awayTeamName'>,
): boolean {
  return (
    teamsMatch(match.homeTeam, fixture.homeTeamName) &&
    teamsMatch(match.awayTeam, fixture.awayTeamName)
  );
}

export function findFixtureForMatch(
  match: MatchConfig,
  fixtures: FixtureData[],
): FixtureData | null {
  for (const fixture of fixtures) {
    if (verifyFixtureTeams(match, fixture)) {
      return fixture;
    }
  }
  return null;
}

export function kickoffToApiDate(kickoffKst: string): string {
  const date = new Date(kickoffKst);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}
