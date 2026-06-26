import { describe, expect, it } from 'vitest';
import type { StatusResponse } from '../../shared/types.js';
import { computeNotificationHash } from './notification-hash.js';
import { buildMemoTemplate, buildPayloadSummary, buildPushTitle, buildGoUrl } from './notification-message.js';

function sampleStatus(overrides?: Partial<StatusResponse>): StatusResponse {
  const base: StatusResponse = {
    updatedAt: '2026-06-26T12:00:00.000Z',
    requiredMetCount: 3,
    metCount: 1,
    finishedCount: 1,
    onTrack: null,
    matches: [
      {
        id: 1,
        label: '세네갈 vs 이라크',
        group: 'I',
        homeTeam: 'Senegal',
        awayTeam: 'Iraq',
        homeTeamKo: '세네갈',
        awayTeamKo: '이라크',
        kickoffKst: '2026-06-27T04:00:00+09:00',
        apiFixtureId: 1,
        homeScore: 1,
        awayScore: 0,
        conditionMet: true,
        status: 'FT',
        requirement: 'test',
        finishedAt: '2026-06-27T06:00:00.000Z',
        pollFailed: false,
      },
      {
        id: 2,
        label: '우루과이 vs 스페인',
        group: 'H',
        homeTeam: 'Uruguay',
        awayTeam: 'Spain',
        homeTeamKo: '우루과이',
        awayTeamKo: '스페인',
        kickoffKst: '2026-06-27T09:00:00+09:00',
        apiFixtureId: 2,
        homeScore: null,
        awayScore: null,
        conditionMet: null,
        status: 'NS',
        requirement: 'test',
        finishedAt: null,
        pollFailed: false,
      },
    ],
  };
  return { ...base, ...overrides };
}

describe('notification-message', () => {
  it('builds feed template with trigger match title', () => {
    process.env.BASE_URL = 'https://example.test';
    const status = sampleStatus();
    const template = buildMemoTemplate(status, 1);
    expect(template.object_type).toBe('feed');
    expect(template.content.title).toContain('I조 종료');
    expect(template.content.title).toContain('충족');
    expect(template.content.description).toContain('1/3');
    expect(template.content.link.web_url).toBe('https://example.test');
  });

  it('builds payload summary from title', () => {
    const status = sampleStatus();
    const summary = buildPayloadSummary(status, 1);
    expect(summary).toContain('I조 종료');
  });

  it('builds short push title with score and met count', () => {
    const status = sampleStatus();
    const title = buildPushTitle(status, 1);
    expect(title).toContain('세네갈 1-0 이라크');
    expect(title).toContain('1/3');
  });

  it('builds go url with status params', () => {
    const status = sampleStatus();
    const url = buildGoUrl(status);
    expect(url).toContain('met=1');
    expect(url).toContain('finished=1');
    expect(url).toMatch(/^\/go\?/);
  });
});

describe('computeNotificationHash', () => {
  it('returns same hash for identical status', () => {
    const a = sampleStatus();
    const b = sampleStatus();
    expect(computeNotificationHash(a)).toBe(computeNotificationHash(b));
  });

  it('changes hash when metCount changes', () => {
    const a = sampleStatus({ metCount: 1 });
    const b = sampleStatus({ metCount: 2 });
    expect(computeNotificationHash(a)).not.toBe(computeNotificationHash(b));
  });
});
