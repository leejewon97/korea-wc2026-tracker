import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { evaluateCondition } from '../../shared/conditions.js';
import type { MatchStatus } from '../../shared/types.js';
import { getMatchState, getUserById, resetMatchState, upsertMatchState } from '../db/index.js';
import { getAdminStats } from '../services/visitor-analytics.js';
import { onMatchFinished } from '../services/notifier.js';
import { parseSessionToken, SESSION_COOKIE } from '../services/session.js';
import { sendTestNotificationToUser } from '../services/test-notification.js';

export const adminRoutes = new Hono();

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return secret;
}

function verifyAdminSecret(secret: string | undefined): string | null {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return 'ADMIN_SECRET not configured';
  if (secret !== adminSecret) return 'Unauthorized';
  return null;
}

adminRoutes.get('/admin/stats', (c) => {
  const authError = verifyAdminSecret(c.req.query('secret'));
  if (authError === 'Unauthorized') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (authError) {
    return c.json({ error: authError }, 503);
  }

  return c.json(getAdminStats());
});

adminRoutes.post('/admin/score', async (c) => {
  const body = await c.req.json<{
    matchId: number;
    homeScore: number;
    awayScore: number;
    secret: string;
  }>();

  const authError = verifyAdminSecret(body.secret);
  if (authError === 'Unauthorized') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (authError) {
    return c.json({ error: authError }, 503);
  }

  const matchId = Number(body.matchId);
  const homeScore = Number(body.homeScore);
  const awayScore = Number(body.awayScore);

  if (
    !Number.isInteger(matchId) ||
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  const existing = getMatchState(matchId);
  if (!existing) {
    return c.json({ error: 'Match not found' }, 404);
  }

  const status: MatchStatus = 'MANUAL';
  const now = new Date().toISOString();
  const conditionMet = evaluateCondition(matchId, homeScore, awayScore, status);

  upsertMatchState({
    matchId,
    homeScore,
    awayScore,
    status,
    conditionMet,
    finishedAt: now,
    pollFailed: false,
    pollAttempts: 0,
  });

  void onMatchFinished(matchId);

  return c.json({
    ok: true,
    matchId,
    homeScore,
    awayScore,
    conditionMet,
  });
});

adminRoutes.post('/admin/reset', async (c) => {
  const body = await c.req.json<{ matchId: number; secret: string }>();
  const authError = verifyAdminSecret(body.secret);
  if (authError === 'Unauthorized') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (authError) {
    return c.json({ error: authError }, 503);
  }

  const matchId = Number(body.matchId);
  if (!Number.isInteger(matchId) || matchId < 1 || matchId > 6) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  if (!getMatchState(matchId)) {
    return c.json({ error: 'Match not found' }, 404);
  }

  resetMatchState(matchId);
  return c.json({ ok: true, matchId });
});

adminRoutes.post('/admin/test-send', async (c) => {
  const body = await c.req.json<{ secret: string }>();
  const authError = verifyAdminSecret(body.secret);
  if (authError === 'Unauthorized') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (authError) {
    return c.json({ error: authError }, 503);
  }

  const session = parseSessionToken(
    getCookie(c, SESSION_COOKIE),
    getSessionSecret(),
  );
  if (!session) {
    return c.json(
      {
        error:
          '로그인이 필요합니다. 메인에서 카카오 구독 후 같은 브라우저에서 다시 시도하세요.',
      },
      401,
    );
  }

  const user = getUserById(session.userId);
  if (!user) {
    return c.json({ error: '구독 사용자를 찾을 수 없습니다.' }, 401);
  }

  const result = await sendTestNotificationToUser(user);
  if (!result.kakaoSent && result.pushSent === 0) {
    return c.json(
      { error: '테스트 발송 실패', kakaoSent: false, pushSent: 0, errors: result.errors },
      502,
    );
  }

  return c.json({ ok: true, ...result });
});
