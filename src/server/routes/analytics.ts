import { Hono } from 'hono';
import { recordPageVisit } from '../services/visitor-analytics.js';

export const analyticsRoutes = new Hono();

analyticsRoutes.post('/analytics/visit', (c) => {
  const stats = recordPageVisit(c);
  return c.json({ ok: true, ...stats });
});
