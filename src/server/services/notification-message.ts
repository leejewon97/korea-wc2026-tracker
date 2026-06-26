import type { StatusResponse } from '../../shared/types.js';
import { detectMilestone } from '../../shared/conditions.js';
import { getBaseUrl } from './notification-hash.js';

const PROFILE_TEXT = '대한민국 32강 진출 트래커';

export interface KakaoFeedTemplate {
  object_type: 'feed';
  content: {
    title: string;
    description: string;
    image_url: string;
    link: {
      web_url: string;
      mobile_web_url: string;
    };
  };
  item_content: {
    profile_text: string;
    profile_image_url: string;
    items: Array<{ item: string; item_op: string }>;
    sum: string;
    sum_op: string;
  };
  buttons: Array<{
    title: string;
    link: {
      web_url: string;
      mobile_web_url: string;
    };
  }>;
}

function isFinished(status: string): boolean {
  return ['FT', 'AET', 'PEN', 'MANUAL'].includes(status);
}

function siteLink(baseUrl: string) {
  return { web_url: baseUrl, mobile_web_url: baseUrl };
}

function itemOpForMatch(
  match: StatusResponse['matches'][number],
): string {
  if (!isFinished(match.status)) return '예정';
  const mark = match.conditionMet ? '✅' : '❌';
  return `${match.homeScore}-${match.awayScore} ${mark}`;
}

function buildContentTitle(
  status: StatusResponse,
  finishedTrigger: StatusResponse['matches'][number] | undefined,
  milestone: ReturnType<typeof detectMilestone>,
): string {
  if (milestone === 'advance_confirmed') {
    return `32강 진출 확정! 🎉 (${status.metCount}/${status.requiredMetCount})`;
  }
  if (milestone === 'eliminated_confirmed') {
    return `탈락 확정 😢 (${status.metCount}/${status.requiredMetCount})`;
  }
  if (finishedTrigger) {
    const mark = finishedTrigger.conditionMet ? '충족' : '미충족';
    return `${finishedTrigger.group}조 ${finishedTrigger.homeTeamKo} ${finishedTrigger.homeScore}-${finishedTrigger.awayScore} ${finishedTrigger.awayTeamKo} (${mark})`;
  }
  return `32강 진출 ${status.metCount}/${status.requiredMetCount}`;
}

function formatItemStyleLine(
  match: StatusResponse['matches'][number],
): string {
  const item = `${match.group}조`;
  const itemOp = itemOpForMatch(match);
  return `${item.padEnd(20, ' ')}${itemOp}`;
}

function match6ResultLine(status: StatusResponse): string | null {
  const match6 = status.matches.find((m) => m.id === 6);
  if (!match6 || !isFinished(match6.status)) return null;
  return formatItemStyleLine(match6);
}

function allMatchesFinished(status: StatusResponse): boolean {
  return status.finishedCount >= status.matches.length;
}

function buildContentDescription(
  status: StatusResponse,
  milestone: ReturnType<typeof detectMilestone>,
): string {
  const match6Line =
    milestone && allMatchesFinished(status)
      ? match6ResultLine(status)
      : null;

  if (match6Line) return match6Line;

  if (milestone === 'advance_confirmed') {
    return '추적 6경기 중 3개 이상 달성';
  }
  if (milestone === 'eliminated_confirmed') {
    return '남은 경기로 3개 충족 불가';
  }
  return `종료 ${status.finishedCount}/6 · 아래 1~5경기 현황`;
}

export function buildMemoTemplate(
  status: StatusResponse,
  triggerMatchId?: number,
): KakaoFeedTemplate {
  const baseUrl = getBaseUrl();
  const ogImage = `${baseUrl}/og-image.png`;
  const trigger = status.matches.find((m) => m.id === triggerMatchId);
  const finishedTrigger =
    trigger && isFinished(trigger.status) ? trigger : undefined;
  const milestone = detectMilestone(
    status.metCount,
    status.finishedCount,
    status.matches.length,
    status.requiredMetCount,
  );

  const matches1to5 = status.matches
    .filter((m) => m.id >= 1 && m.id <= 5)
    .sort((a, b) => a.id - b.id);

  return {
    object_type: 'feed',
    content: {
      title: buildContentTitle(status, finishedTrigger, milestone),
      description: buildContentDescription(status, milestone),
      image_url: ogImage,
      link: siteLink(baseUrl),
    },
    item_content: {
      profile_text: PROFILE_TEXT,
      profile_image_url: ogImage,
      items: matches1to5.map((match) => ({
        item: `${match.group}조`,
        item_op: itemOpForMatch(match),
      })),
      sum: '충족',
      sum_op: `${status.metCount}/${status.requiredMetCount}`,
    },
    buttons: [
      {
        title: '웹에서 전체 보기',
        link: siteLink(baseUrl),
      },
    ],
  };
}

export function buildPayloadSummary(
  status: StatusResponse,
  triggerMatchId?: number,
): string {
  const template = buildMemoTemplate(status, triggerMatchId);
  return template.content.title;
}

export function buildPushTitle(
  status: StatusResponse,
  triggerMatchId?: number,
): string {
  const milestone = detectMilestone(
    status.metCount,
    status.finishedCount,
    status.matches.length,
    status.requiredMetCount,
  );
  if (milestone === 'advance_confirmed') {
    return '32강 진출 확정! 🎉';
  }
  if (milestone === 'eliminated_confirmed') {
    return '탈락 확정 😢';
  }

  const trigger = status.matches.find((m) => m.id === triggerMatchId);
  const finishedTrigger =
    trigger && isFinished(trigger.status) ? trigger : undefined;

  if (finishedTrigger) {
    const score = `${finishedTrigger.homeTeamKo} ${finishedTrigger.homeScore}-${finishedTrigger.awayScore} ${finishedTrigger.awayTeamKo}`;
    return `${score} · ${status.metCount}/${status.requiredMetCount} 충족`;
  }

  return `32강 ${status.metCount}/${status.requiredMetCount} 충족`;
}

export function buildGoUrl(status: StatusResponse): string {
  const params = new URLSearchParams({
    met: String(status.metCount),
    finished: String(status.finishedCount),
    required: String(status.requiredMetCount),
  });
  const milestone = detectMilestone(
    status.metCount,
    status.finishedCount,
    status.matches.length,
    status.requiredMetCount,
  );
  if (milestone) params.set('milestone', milestone);
  if (status.onTrack === true) params.set('onTrack', '1');
  if (status.onTrack === false) params.set('onTrack', '0');
  return `/go?${params.toString()}`;
}

function buildMatches1to5Items(status: StatusResponse) {
  return status.matches
    .filter((m) => m.id >= 1 && m.id <= 5)
    .sort((a, b) => a.id - b.id)
    .map((match) => ({
      item: `${match.group}조`,
      item_op: itemOpForMatch(match),
    }));
}

function buildFeedShell(
  status: StatusResponse,
  content: { title: string; description: string },
): KakaoFeedTemplate {
  const baseUrl = getBaseUrl();
  const ogImage = `${baseUrl}/og-image.png`;
  return {
    object_type: 'feed',
    content: {
      title: content.title,
      description: content.description,
      image_url: ogImage,
      link: siteLink(baseUrl),
    },
    item_content: {
      profile_text: PROFILE_TEXT,
      profile_image_url: ogImage,
      items: buildMatches1to5Items(status),
      sum: '충족',
      sum_op: `${status.metCount}/${status.requiredMetCount}`,
    },
    buttons: [
      {
        title: '웹에서 전체 보기',
        link: siteLink(baseUrl),
      },
    ],
  };
}

export function buildKickoffMemoTemplate(
  status: StatusResponse,
  matchId: number,
): KakaoFeedTemplate {
  const match = status.matches.find((m) => m.id === matchId);
  if (!match) {
    throw new Error(`Match ${matchId} not found in status`);
  }
  return buildFeedShell(status, {
    title: `${match.group}조 ${match.homeTeamKo} vs ${match.awayTeamKo} 경기 시작`,
    description: `현재 ${status.metCount}/${status.requiredMetCount} 충족 · 종료 ${status.finishedCount}/6`,
  });
}

export function buildKickoffPushTitle(
  status: StatusResponse,
  matchId: number,
): string {
  const match = status.matches.find((m) => m.id === matchId);
  if (!match) {
    throw new Error(`Match ${matchId} not found in status`);
  }
  return `${match.group}조 ${match.homeTeamKo} vs ${match.awayTeamKo} 경기 시작 · ${status.metCount}/${status.requiredMetCount} 충족`;
}
