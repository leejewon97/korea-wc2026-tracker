import { describe, expect, it } from 'vitest';
import type { StatusResponse } from '../../shared/types.js';
import { computeNotificationHash } from './notification-hash.js';
import { buildMemoTemplate, buildPayloadSummary, buildPushTitle, buildGoUrl, buildKickoffMemoTemplate, buildKickoffPushTitle } from './notification-message.js';

function pendingMatch(id: number) {
  return {
    id,
    label: `경기 ${id}`,
    group: 'X',
    homeTeam: 'A',
    awayTeam: 'B',
    homeTeamKo: 'A',
    awayTeamKo: 'B',
    kickoffKst: '2026-06-28T09:00:00+09:00',
    apiFixtureId: id,
    homeScore: null,
    awayScore: null,
    conditionMet: null,
    status: 'NS' as const,
    requirement: 'test',
    finishedAt: null,
    pollFailed: false,
  };
}

function sampleStatus(overrides?: Partial<StatusResponse>): StatusResponse {
  const base: StatusResponse = {
    updatedAt: '2026-06-26T12:00:00.000Z',
    serverTime: '2026-06-26T12:00:00.000Z',
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
      pendingMatch(3),
      pendingMatch(4),
      pendingMatch(5),
      pendingMatch(6),
    ],
  };
  return { ...base, ...overrides };
}

describe('notification-message', () => {
  it('builds feed B template with trigger match in content and rows 1-5', () => {
    process.env.BASE_URL = 'https://example.test';
    const status = sampleStatus();
    const template = buildMemoTemplate(status, 1);
    expect(template.object_type).toBe('feed');
    expect(template.content.title).toContain('I조');
    expect(template.content.title).toContain('충족');
    expect(template.content.image_url).toBe('https://example.test/og-image.png');
    expect(template.content.link.web_url).toBe('https://example.test');
    expect(template.item_content.profile_text).toBe('대한민국 32강 진출 트래커');
    expect(template.item_content.profile_image_url).toBe(
      'https://example.test/og-image.png',
    );
    expect(template.item_content.items).toHaveLength(5);
    expect(template.item_content.items[0]).toEqual({
      item: 'I조',
      item_op: '1-0 ✅',
    });
    expect(template.item_content.items[1]).toEqual({
      item: 'H조',
      item_op: '예정',
    });
    expect(template.item_content.sum_op).toBe('1/3');
  });

  it('puts match 6 in content area, not in items 1-5', () => {
    const status = sampleStatus({
      metCount: 3,
      finishedCount: 6,
      matches: sampleStatus().matches.map((m) =>
        m.id === 6
          ? {
              ...m,
              group: 'J',
              label: '알제리 vs 오스트리아',
              homeTeamKo: '알제리',
              awayTeamKo: '오스트리아',
              homeScore: 0,
              awayScore: 1,
              conditionMet: true,
              status: 'FT' as const,
            }
          : { ...m, status: 'FT' as const, homeScore: 1, awayScore: 0, conditionMet: true },
      ),
    });
    const template = buildMemoTemplate(status, 6);
    expect(template.content.title).toContain('32강 진출 확정');
    expect(template.item_content.items).toHaveLength(5);
    expect(template.item_content.items.some((row) => row.item === 'J조')).toBe(
      false,
    );
    expect(template.content.description).toMatch(/^J조\s+0-1 ✅$/);
    expect(template.content.description).not.toContain('추적 6경기');
  });

  it('omits match 6 from description on early advance', () => {
    const status = sampleStatus({ metCount: 3, finishedCount: 3 });
    const template = buildMemoTemplate(status, 3);
    expect(template.content.description).toBe('추적 6경기 중 3개 이상 달성');
    expect(template.content.description).not.toContain('J조');
  });

  it('shows match 6 in description on final-match elimination', () => {
    const status = sampleStatus({
      metCount: 2,
      finishedCount: 6,
      matches: sampleStatus().matches.map((m) =>
        m.id === 6
          ? {
              ...m,
              group: 'J',
              homeScore: 1,
              awayScore: 0,
              conditionMet: false,
              status: 'FT' as const,
            }
          : {
              ...m,
              status: 'FT' as const,
              homeScore: m.id <= 2 ? 1 : 0,
              awayScore: m.id <= 2 ? 0 : 1,
              conditionMet: m.id <= 2,
            },
      ),
    });
    const template = buildMemoTemplate(status, 6);
    expect(template.content.title).toContain('탈락 확정');
    expect(template.content.description).toMatch(/^J조\s+1-0 ❌$/);
    expect(template.content.description).not.toContain('남은 경기');
  });

  it('builds payload summary from title', () => {
    const status = sampleStatus();
    const summary = buildPayloadSummary(status, 1);
    expect(summary).toContain('I조');
  });

  it('builds short push title with score and met count', () => {
    const status = sampleStatus();
    const title = buildPushTitle(status, 1);
    expect(title).toContain('세네갈 1-0 이라크');
    expect(title).toContain('1/3');
  });

  it('builds advance milestone titles', () => {
    const status = sampleStatus({ metCount: 3, finishedCount: 3 });
    expect(buildPushTitle(status, 1)).toBe('32강 진출 확정! 🎉');
    expect(buildMemoTemplate(status, 1).content.title).toContain('32강 진출 확정');
  });

  it('builds eliminated milestone titles', () => {
    const status = sampleStatus({ metCount: 1, finishedCount: 5 });
    expect(buildPushTitle(status)).toBe('탈락 확정 😢');
    expect(buildMemoTemplate(status).content.title).toContain('탈락 확정');
  });

  it('includes milestone in go url', () => {
    const status = sampleStatus({ metCount: 3, finishedCount: 3 });
    expect(buildGoUrl(status)).toContain('milestone=advance_confirmed');
  });

  it('builds go url with status params', () => {
    const status = sampleStatus();
    const url = buildGoUrl(status);
    expect(url).toContain('met=1');
    expect(url).toContain('finished=1');
    expect(url).toMatch(/^\/go\?/);
  });

  it('builds kickoff memo template with match title and progress', () => {
    process.env.BASE_URL = 'https://example.test';
    const status = sampleStatus({ metCount: 0, finishedCount: 0 });
    const template = buildKickoffMemoTemplate(status, 1);
    expect(template.content.title).toBe('I조 세네갈 vs 이라크 경기 시작');
    expect(template.content.description).toBe('현재 0/3 충족 · 종료 0/6');
    expect(template.item_content.items).toHaveLength(5);
    expect(template.item_content.items[0]).toEqual({
      item: 'I조',
      item_op: '1-0 ✅',
    });
    expect(template.item_content.items[1]).toEqual({
      item: 'H조',
      item_op: '예정',
    });
  });

  it('builds kickoff push title with met count', () => {
    const status = sampleStatus({ metCount: 1, finishedCount: 1 });
    expect(buildKickoffPushTitle(status, 1)).toBe(
      'I조 세네갈 vs 이라크 경기 시작 · 1/3 충족',
    );
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
