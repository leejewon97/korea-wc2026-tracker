export type MatchStatus = 'NS' | 'LIVE' | 'FT' | 'AET' | 'PEN' | 'MANUAL';

export interface MatchConfig {
  id: number;
  label: string;
  group: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamKo: string;
  awayTeamKo: string;
  kickoffKst: string;
  apiFixtureId: number | null;
}

export interface MatchState {
  matchId: number;
  apiFixtureId: number | null;
  kickoffKst: string;
  homeScore: number | null;
  awayScore: number | null;
  conditionMet: boolean | null;
  status: MatchStatus;
  finishedAt: string | null;
  pollingStartedAt: string | null;
  pollAttempts: number;
  pollFailed: boolean;
  lastPollAt: string | null;
}

export interface ConditionRequirement {
  matchId: number;
  description: string;
}

export const CONDITION_REQUIREMENTS: ConditionRequirement[] = [
  { matchId: 1, description: '세네갈 1골차 이하 승 또는 이라크 4골차 이하 승' },
  { matchId: 2, description: '스페인 승' },
  { matchId: 3, description: '이집트 승' },
  { matchId: 4, description: '가나 승' },
  { matchId: 5, description: '콩고민주 무승부 또는 패배' },
  { matchId: 6, description: '오스트리아 승 또는 알제리 2골차 이상 승' },
];

export const REQUIRED_MET_COUNT = 3;

export interface StatusResponse {
  updatedAt: string;
  requiredMetCount: number;
  metCount: number;
  finishedCount: number;
  onTrack: boolean | null;
  matches: Array<
    MatchConfig & {
      homeScore: number | null;
      awayScore: number | null;
      conditionMet: boolean | null;
      status: MatchStatus;
      requirement: string;
      finishedAt: string | null;
      pollFailed: boolean;
    }
  >;
}

export interface PollingConfig {
  startAfterMinutes: number;
  intervalMinutes: number;
  maxAttempts: number;
}

export interface MatchesFileConfig {
  requiredMetCount: number;
  polling: PollingConfig;
  matches: MatchConfig[];
}

export interface FixtureData {
  fixtureId: number;
  homeScore: number | null;
  awayScore: number | null;
  statusShort: string;
  homeTeamName: string;
  awayTeamName: string;
}
