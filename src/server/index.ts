import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAllMatchStates, getDb } from './db/index.js';
import { seedMatches } from './db/seed.js';
import { statusRoutes } from './routes/status.js';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: '*',
  }),
);

app.route('/api', statusRoutes);

app.get('/health', (c) => c.json({ ok: true }));

const publicDir = resolve(process.cwd(), 'dist/public');
if (existsSync(publicDir)) {
  app.use('/*', serveStatic({ root: publicDir }));
  app.get('/', serveStatic({ path: 'index.html', root: publicDir }));
  app.get('/go', serveStatic({ path: 'go.html', root: publicDir }));
}

const port = Number(process.env.PORT ?? 3000);

getDb();
if (getAllMatchStates().length === 0) {
  seedMatches();
}

console.log(`Server listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
