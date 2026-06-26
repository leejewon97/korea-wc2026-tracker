import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectMilestone, evaluateCondition } from '../../shared/conditions.js';
import {
  CONDITION_REQUIREMENTS,
  REQUIRED_MET_COUNT,
  type MatchConfig,
  type StatusResponse,
} from '../../shared/types.js';
import {
  getPushSubscriptionsByUserId,
  upsertUser,
  type UserRow,
} from '../db/index.js';
import {
  hasKakaoConfig,
  refreshAccessToken,
  sendMemoToMe,
} from './kakao.js';
import {
  buildGoUrl,
  buildMemoTemplate,
  buildPushTitle,
} from './notification-message.js';
import { hasPushConfig, sendPushToSubscription } from './push.js';
import { decryptToken, encryptToken } from './token-crypto.js';

/** 6번 경기(J조) 종료 후 탈락 확정 트리거 */
export const TEST_TRIGGER_MATCH_ID = 6;

const FINAL_ELIMINATION_SCORES: Record<
  number,
  { homeScore: number; awayScore: number }
> = {
  1: { homeScore: 1, awayScore: 0 },
  2: { homeScore: 2, awayScore: 0 },
  3: { homeScore: 1, awayScore: 1 },
  4: { homeScore: 2, awayScore: 0 },
  5: { homeScore: 1, awayScore: 1 },
  6: { homeScore: 1, awayScore: 0 },
};

interface MatchesFile {
  requiredMetCount: number;
  matches: MatchConfig[];
}

function loadConfig(): MatchesFile {
  const path = resolve(process.cwd(), 'config/matches.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as MatchesFile;
}

function requirementFor(matchId: number): string {
  return (
    CONDITION_REQUIREMENTS.find((r) => r.matchId === matchId)?.description ??
    ''
  );
}

/** 6경기 종료·2/3 충족 탈락 확정 시나리오. DB는 변경하지 않음. */
export function buildFinalEliminationTestStatus(): StatusResponse {
  const config = loadConfig();
  const now = new Date().toISOString();
  const finishedStatus = 'FT' as const;
  const required = config.requiredMetCount ?? REQUIRED_MET_COUNT;

  const matches = config.matches.map((match) => {
    const scores = FINAL_ELIMINATION_SCORES[match.id];
    if (!scores) {
      throw new Error(`Missing test score for match ${match.id}`);
    }

    const { homeScore, awayScore } = scores;
    return {
      ...match,
      apiFixtureId: match.apiFixtureId ?? null,
      homeScore,
      awayScore,
      conditionMet: evaluateCondition(
        match.id,
        homeScore,
        awayScore,
        finishedStatus,
      ),
      status: finishedStatus,
      requirement: requirementFor(match.id),
      finishedAt: now,
      pollFailed: false,
    };
  });

  const metCount = matches.filter((m) => m.conditionMet === true).length;
  const finishedCount = matches.length;

  return {
    updatedAt: now,
    serverTime: now,
    requiredMetCount: required,
    metCount,
    finishedCount,
    onTrack: false,
    matches,
  };
}

export interface TestSendResult {
  kakaoSent: boolean;
  pushSent: number;
  errors: string[];
}

export async function sendTestNotificationToUser(
  user: UserRow,
): Promise<TestSendResult> {
  const status = buildFinalEliminationTestStatus();
  const template = buildMemoTemplate(status, TEST_TRIGGER_MATCH_ID);
  const pushTitle = buildPushTitle(status, TEST_TRIGGER_MATCH_ID);
  const pushUrl = buildGoUrl(status);
  const errors: string[] = [];
  let kakaoSent = false;
  let pushSent = 0;

  const milestone = detectMilestone(
    status.metCount,
    status.finishedCount,
    status.matches.length,
    status.requiredMetCount,
  );
  if (milestone !== 'eliminated_confirmed') {
    errors.push(`unexpected milestone: ${milestone ?? 'none'}`);
  }

  if (hasKakaoConfig()) {
    try {
      let refreshToken = decryptToken(user.refresh_token_enc);
      const tokenRes = await refreshAccessToken(refreshToken);
      if (tokenRes.refresh_token) {
        refreshToken = tokenRes.refresh_token;
        upsertUser(user.kakao_user_id, encryptToken(refreshToken));
      }
      await sendMemoToMe(tokenRes.access_token, template);
      kakaoSent = true;
    } catch (err) {
      errors.push(`kakao: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    errors.push('kakao: not configured');
  }

  if (hasPushConfig()) {
    const subs = getPushSubscriptionsByUserId(user.id);
    if (subs.length === 0) {
      errors.push('push: no subscription');
    }
    for (const sub of subs) {
      try {
        await sendPushToSubscription(sub, { title: pushTitle, url: pushUrl });
        pushSent++;
      } catch (err) {
        errors.push(`push: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    errors.push('push: not configured');
  }

  return { kakaoSent, pushSent, errors };
}
