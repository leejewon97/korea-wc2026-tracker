import type { StatusResponse } from '../../shared/types.js';
import { detectMilestone } from '../../shared/conditions.js';
import { getBaseUrl } from './notification-hash.js';

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

function matchLine(
  match: StatusResponse['matches'][number],
): string {
  const finished = isFinished(match.status);
  if (!finished) {
    return `⏳ ${match.group}조: ${match.label} (대기)`;
  }
  const score = `${match.homeTeamKo} ${match.homeScore} - ${match.awayScore} ${match.awayTeamKo}`;
  const mark = match.conditionMet ? '✅' : '❌';
  return `${mark} ${match.group}조: ${score}`;
}

export function buildMemoTemplate(
  status: StatusResponse,
  triggerMatchId?: number,
): KakaoFeedTemplate {
  const baseUrl = getBaseUrl();
  const trigger = status.matches.find((m) => m.id === triggerMatchId);
  const finishedTrigger =
    trigger && isFinished(trigger.status) ? trigger : undefined;
  const milestone = detectMilestone(
    status.metCount,
    status.finishedCount,
    status.matches.length,
    status.requiredMetCount,
  );

  let title: string;
  if (milestone === 'advance_confirmed') {
    title = `32강 진출 확정! (${status.metCount}/${status.requiredMetCount} 충족)`;
  } else if (milestone === 'eliminated_confirmed') {
    title = `탈락 확정 (${status.metCount}/${status.requiredMetCount}, 종료 ${status.finishedCount}/6)`;
  } else if (finishedTrigger) {
    const mark = finishedTrigger.conditionMet ? '충족' : '미충족';
    title = `${finishedTrigger.group}조 종료 — ${finishedTrigger.homeTeamKo} ${finishedTrigger.homeScore}-${finishedTrigger.awayScore} ${finishedTrigger.awayTeamKo} (${mark})`;
  } else {
    title = `32강 진출 현황 ${status.metCount}/${status.requiredMetCount}`;
  }

  const summaryLines = status.matches.map(matchLine);
  const milestoneLine =
    milestone === 'advance_confirmed'
      ? '🎉 추적 6경기 중 필요 결과 3개 이상 달성 (앱 기준 확정)'
      : milestone === 'eliminated_confirmed'
        ? '❌ 남은 경기와 관계없이 3개 충족 불가 (앱 기준 확정)'
        : null;

  const description = [
    milestoneLine ??
      `📈 32강 진출 현황: ${status.metCount}/${status.requiredMetCount} 충족 (종료 ${status.finishedCount}/6)`,
    '',
    ...summaryLines,
  ].join('\n');

  return {
    object_type: 'feed',
    content: {
      title,
      description,
      image_url: 'https://t1.kakaocdn.net/kakaocorp/corp_thumbnail/Kakao.png',
      link: {
        web_url: baseUrl,
        mobile_web_url: baseUrl,
      },
    },
    buttons: [
      {
        title: '웹에서 전체 보기',
        link: {
          web_url: baseUrl,
          mobile_web_url: baseUrl,
        },
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
    return '32강 진출 확정!';
  }
  if (milestone === 'eliminated_confirmed') {
    return '탈락 확정';
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
