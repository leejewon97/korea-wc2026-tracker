import { describe, expect, it } from 'vitest';
import type { FixtureData } from '../../shared/types.js';
import {
  findFixtureForMatch,
  kickoffToApiDate,
  kickoffToApiQueryDates,
  teamsMatch,
  verifyFixtureTeams,
} from './fixture-resolver.js';

describe('teamsMatch', () => {
  it('matches exact names', () => {
    expect(teamsMatch('Spain', 'Spain')).toBe(true);
  });

  it('matches Congo DR aliases', () => {
    expect(teamsMatch('Congo DR', 'DR Congo')).toBe(true);
  });
});

describe('verifyFixtureTeams', () => {
  it('returns true when home/away align', () => {
    const match = { homeTeam: 'Spain', awayTeam: 'Uruguay' };
    const fixture = {
      homeTeamName: 'Spain',
      awayTeamName: 'Uruguay',
    };
    expect(verifyFixtureTeams(match, fixture)).toBe(true);
  });

  it('returns false when swapped', () => {
    const match = { homeTeam: 'Spain', awayTeam: 'Uruguay' };
    const fixture = {
      homeTeamName: 'Uruguay',
      awayTeamName: 'Spain',
    };
    expect(verifyFixtureTeams(match, fixture)).toBe(false);
  });
});

describe('findFixtureForMatch', () => {
  const fixtures: FixtureData[] = [
    {
      fixtureId: 100,
      homeTeamName: 'Senegal',
      awayTeamName: 'Iraq',
      homeScore: null,
      awayScore: null,
      statusShort: 'NS',
    },
    {
      fixtureId: 200,
      homeTeamName: 'Uruguay',
      awayTeamName: 'Spain',
      homeScore: null,
      awayScore: null,
      statusShort: 'NS',
    },
  ];

  it('finds matching fixture', () => {
    const match = {
      id: 2,
      label: '우루과이 vs 스페인',
      group: 'H',
      homeTeam: 'Uruguay',
      awayTeam: 'Spain',
      homeTeamKo: '우루과이',
      awayTeamKo: '스페인',
      kickoffKst: '2026-06-27T09:00:00+09:00',
      apiFixtureId: null,
    };
    expect(findFixtureForMatch(match, fixtures)?.fixtureId).toBe(200);
  });
});

describe('kickoffToApiDate', () => {
  it('returns KST calendar date', () => {
    expect(kickoffToApiDate('2026-06-27T04:00:00+09:00')).toBe('2026-06-27');
  });
});

describe('kickoffToApiQueryDates', () => {
  it('includes UTC date when KST calendar day differs', () => {
    expect(kickoffToApiQueryDates('2026-06-27T04:00:00+09:00')).toEqual([
      '2026-06-27',
      '2026-06-26',
    ]);
  });
});
