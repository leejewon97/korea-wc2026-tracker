import { Hono } from 'hono';
import { evaluateCondition } from '../../shared/conditions.js';
import type { MatchStatus } from '../../shared/types.js';
import { getMatchState, upsertMatchState } from '../db/index.js';
import { onMatchFinished } from '../services/notifier.js';

export const adminRoutes = new Hono();

adminRoutes.post('/admin/score', async (c) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return c.json({ error: 'ADMIN_SECRET not configured' }, 503);
  }

  const body = await c.req.json<{
    matchId: number;
    homeScore: number;
    awayScore: number;
    secret: string;
  }>();

  if (body.secret !== adminSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
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

  onMatchFinished(matchId);

  return c.json({
    ok: true,
    matchId,
    homeScore,
    awayScore,
    conditionMet,
  });
});
