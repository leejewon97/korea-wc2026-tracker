import { loadEnvFile } from './load-env.js';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAllMatchStates, getDb } from './db/index.js';
import { seedMatches } from './db/seed.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { publicConfigRoutes } from './routes/public-config.js';
import { pushRoutes } from './routes/push.js';
import { statusRoutes } from './routes/status.js';
import { createHtmlHandler } from './serve-html.js';
import { startScheduler } from './services/match-poller.js';
import { startKickoffScheduler } from './services/kickoff-scheduler.js';
import { resolveFixtures } from './services/resolve-fixtures.js';

loadEnvFile();

const app = new Hono();

app.use(
  '*',
  cors({
    origin: '*',
  }),
);

const api = new Hono();
api.route('/', statusRoutes);
api.route('/', adminRoutes);
api.route('/', authRoutes);
api.route('/', pushRoutes);
api.route('/', publicConfigRoutes);
app.route('/api', api);

app.get('/health', (c) => c.json({ ok: true }));

const publicDir = resolve(process.cwd(), 'dist/public');
if (existsSync(publicDir)) {
  app.get('/', createHtmlHandler(publicDir, 'index.html'));
  app.get('/go', createHtmlHandler(publicDir, 'go.html'));
  app.get('/admin', serveStatic({ path: 'admin.html', root: publicDir }));
  app.use('/*', serveStatic({ root: publicDir }));
}

const port = Number(process.env.PORT ?? 3000);

async function bootstrap(): Promise<void> {
  getDb();
  if (getAllMatchStates().length === 0) {
    seedMatches();
  }

  await resolveFixtures();
  startKickoffScheduler();
  startScheduler();

  console.log(`Server listening on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
