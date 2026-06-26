#!/usr/bin/env node
/**
 * Reset match states via POST /api/admin/reset
 * Usage: node .cursor/skills/restore/scripts/restore-matches.mjs [--all] [--match 1 2] [--base URL]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_BASE =
  'https://korea-wc2026-tracker-production.up.railway.app';

function findProjectRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('Project root (package.json) not found');
}

function loadEnv(root) {
  const path = resolve(root, '.env');
  if (!existsSync(path)) throw new Error('.env not found');
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

function parseArgs(argv) {
  const opts = { all: false, matchIds: [], base: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') opts.all = true;
    else if (argv[i] === '--match') {
      while (argv[i + 1] && /^\d+$/.test(argv[i + 1])) {
        opts.matchIds.push(Number(argv[++i]));
      }
    } else if (argv[i] === '--base' && argv[i + 1]) {
      opts.base = argv[++i].replace(/\/$/, '');
    }
  }
  return opts;
}

function resolveBase(env, override) {
  if (override) return override;
  const fromEnv = env.BASE_URL?.replace(/\/$/, '');
  if (fromEnv && fromEnv !== 'http://localhost:3000') return fromEnv;
  return PRODUCTION_BASE;
}

async function fetchStatus(base) {
  const res = await fetch(`${base}/api/status`);
  if (!res.ok) throw new Error(`/api/status HTTP ${res.status}`);
  return res.json();
}

async function resetMatch(base, secret, matchId) {
  const res = await fetch(`${base}/api/admin/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, secret }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`match ${matchId}: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const root = findProjectRoot();
  const env = loadEnv(root);
  const secret = env.ADMIN_SECRET;
  if (!secret) {
    console.error('ADMIN_SECRET missing in .env');
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));
  const base = resolveBase(env, opts.base);
  console.log(`Base: ${base}`);

  const status = await fetchStatus(base);
  let ids;

  if (opts.matchIds.length > 0) {
    ids = opts.matchIds;
  } else if (opts.all) {
    ids = [1, 2, 3, 4, 5, 6];
  } else {
    ids = status.matches
      .filter((m) => m.status !== 'NS' || m.homeScore !== null || m.awayScore !== null)
      .map((m) => m.id);
  }

  if (ids.length === 0) {
    console.log('Nothing to reset — all matches are NS.');
    return;
  }

  console.log(`Resetting match(es): ${ids.join(', ')}`);
  for (const id of ids) {
    const result = await resetMatch(base, secret, id);
    console.log(`  match ${id}: ok`);
  }

  const after = await fetchStatus(base);
  console.log(
    `Done — finishedCount: ${after.finishedCount}, metCount: ${after.metCount}`,
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
