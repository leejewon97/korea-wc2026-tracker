import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
const examplePath = resolve(process.cwd(), '.env.example');

if (existsSync(envPath)) {
  console.log('.env already exists — skipped (delete it to regenerate).');
  process.exit(0);
}

const template = readFileSync(examplePath, 'utf-8');
const sessionSecret = randomBytes(32).toString('hex');
const adminSecret = randomBytes(16).toString('hex');
const tokenKey = randomBytes(16).toString('hex');

const content = template
  .replace('change-me-to-random-string', sessionSecret)
  .replace('change-me-admin-secret', adminSecret)
  .replace('0123456789abcdef0123456789abcdef', tokenKey);

writeFileSync(envPath, content, 'utf-8');
console.log('Created .env with random SESSION_SECRET, ADMIN_SECRET, TOKEN_ENCRYPTION_KEY.');
console.log('Add your API_FOOTBALL_KEY to .env, then run: npm run verify:fixtures');
