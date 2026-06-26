import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateEncryptionKeyHex } from '../src/server/services/token-crypto.js';

const envPath = resolve(process.cwd(), '.env');
const examplePath = resolve(process.cwd(), '.env.example');

if (existsSync(envPath)) {
  console.log('.env already exists — skipped (delete it to regenerate).');
  process.exit(0);
}

const template = readFileSync(examplePath, 'utf-8');
const adminSecret = randomBytes(16).toString('hex');
const sessionSecret = randomBytes(32).toString('hex');
const tokenEncryptionKey = generateEncryptionKeyHex();

let content = template.replace('change-me-admin-secret', adminSecret);
content = content.replace('change-me-session-secret', sessionSecret);
content = content.replace('change-me-token-encryption-key', tokenEncryptionKey);

writeFileSync(envPath, content, 'utf-8');
console.log('Created .env with random ADMIN_SECRET, SESSION_SECRET, TOKEN_ENCRYPTION_KEY.');
console.log('Add KICKOFF_API_KEY and KAKAO_* keys to .env, then run: npm run verify:kickoff');
