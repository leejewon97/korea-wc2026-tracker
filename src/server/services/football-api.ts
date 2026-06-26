import type { FixtureData, MatchStatus } from '../../shared/types.js';

const BASE_URL = 'https://v3.football.api-sports.io';

interface ApiFixtureResponse {
  fixture: { id: number; status: { short: string } };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

interface ApiResponse {
  response: ApiFixtureResponse[];
  errors?: Record<string, string>;
}

export function getApiKey(): string | undefined {
  return process.env.API_FOOTBALL_KEY?.trim() || undefined;
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}

function parseFixture(item: ApiFixtureResponse): FixtureData {
  return {
    fixtureId: item.fixture.id,
    homeScore: item.goals.home,
    awayScore: item.goals.away,
    statusShort: item.fixture.status.short,
    homeTeamName: item.teams.home.name,
    awayTeamName: item.teams.away.name,
  };
}

async function apiGet(path: string): Promise<ApiResponse> {
  const key = getApiKey();
  if (!key) {
    throw new Error('API_FOOTBALL_KEY is not set');
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'x-apisports-key': key },
  });

  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  if (remaining !== null) {
    console.log(`[football-api] requests remaining today: ${remaining}`);
  }

  if (!res.ok) {
    throw new Error(`API-Football HTTP ${res.status}: ${path}`);
  }

  const data = (await res.json()) as ApiResponse;
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(
      `API-Football error: ${JSON.stringify(data.errors)}`,
    );
  }

  return data;
}

export async function fetchFixture(fixtureId: number): Promise<FixtureData | null> {
  const data = await apiGet(`/fixtures?id=${fixtureId}`);
  const item = data.response[0];
  if (!item) return null;
  return parseFixture(item);
}

export async function fetchFixturesByDate(
  date: string,
  league = 1,
  season = 2026,
): Promise<FixtureData[]> {
  const data = await apiGet(
    `/fixtures?league=${league}&season=${season}&date=${date}`,
  );
  return data.response.map(parseFixture);
}

const FINISHED = new Set(['FT', 'AET', 'PEN']);

export function isFinishedStatusShort(short: string): boolean {
  return FINISHED.has(short);
}

export function mapApiStatusToMatchStatus(short: string): MatchStatus {
  if (FINISHED.has(short)) return short as MatchStatus;
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(short)) {
    return 'LIVE';
  }
  return 'NS';
}

export function isGoalsConfirmed(
  homeScore: number | null,
  awayScore: number | null,
): boolean {
  return homeScore !== null && awayScore !== null;
}
