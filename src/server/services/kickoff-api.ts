import type { FixtureData, MatchStatus } from '../../shared/types.js';

const BASE_URL = 'https://api.kickoffapi.com/api/v1';

interface ApiFixtureNested {
  fixture: { id: number; status: { short: string } };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

interface ApiFixtureFlat {
  id: number;
  statusShort: string;
  goalsHome: number | null;
  goalsAway: number | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
}

type ApiFixtureItem = ApiFixtureNested | ApiFixtureFlat;

interface ApiResponse {
  response: ApiFixtureItem[];
  errors?: Record<string, string>;
}

function isNestedFixture(item: ApiFixtureItem): item is ApiFixtureNested {
  return 'fixture' in item && item.fixture !== undefined;
}

function parseFixture(item: ApiFixtureItem): FixtureData {
  if (isNestedFixture(item)) {
    return {
      fixtureId: item.fixture.id,
      homeScore: item.goals.home,
      awayScore: item.goals.away,
      statusShort: item.fixture.status.short,
      homeTeamName: item.teams.home.name,
      awayTeamName: item.teams.away.name,
    };
  }
  return {
    fixtureId: item.id,
    homeScore: item.goalsHome,
    awayScore: item.goalsAway,
    statusShort: item.statusShort,
    homeTeamName: item.homeTeam.name,
    awayTeamName: item.awayTeam.name,
  };
}

export interface RateLimitInfo {
  limit: string | null;
  remaining: string | null;
  reset: string | null;
}

let lastRateLimit: RateLimitInfo = {
  limit: null,
  remaining: null,
  reset: null,
};

export function getLastRateLimit(): RateLimitInfo {
  return lastRateLimit;
}

export function getApiKey(): string | undefined {
  return process.env.KICKOFF_API_KEY?.trim() || undefined;
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}

function captureRateLimit(res: Response): void {
  lastRateLimit = {
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
    reset: res.headers.get('x-ratelimit-reset'),
  };
  if (lastRateLimit.remaining !== null) {
    console.log(
      `[kickoff-api] rate limit: ${lastRateLimit.remaining}/${lastRateLimit.limit ?? '?'} remaining`,
    );
  }
}

async function apiGet(path: string): Promise<ApiResponse> {
  const key = getApiKey();
  if (!key) {
    throw new Error('KICKOFF_API_KEY is not set');
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'x-api-key': key },
  });

  captureRateLimit(res);

  const text = await res.text();
  if (!res.ok) {
    const snippet = text.slice(0, 300);
    throw new Error(`KickoffAPI HTTP ${res.status}: ${path} — ${snippet}`);
  }

  const data = JSON.parse(text) as ApiResponse;
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`KickoffAPI error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

export async function fetchFixture(
  fixtureId: number,
): Promise<FixtureData | null> {
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
