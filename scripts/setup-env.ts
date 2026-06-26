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
const adminSecret = randomBytes(16).toString('hex');

const content = template.replace('change-me-admin-secret', adminSecret);

writeFileSync(envPath, content, 'utf-8');
console.log('Created .env with random ADMIN_SECRET.');
console.log('Add KICKOFF_API_KEY to .env, then run: npm run verify:kickoff');
