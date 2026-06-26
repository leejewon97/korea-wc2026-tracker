import { Hono } from 'hono';
import { buildStatusResponse } from '../services/status.js';

export const statusRoutes = new Hono();

statusRoutes.get('/status', (c) => {
  return c.json(buildStatusResponse());
});
