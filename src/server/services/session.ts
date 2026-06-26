import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'session';
export const OAUTH_STATE_COOKIE = 'oauth_state';

export interface SessionPayload {
  userId: number;
  exp: number;
}

export function createOAuthState(): string {
  return randomBytes(16).toString('hex');
}

export function signPayload(payload: SessionPayload, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifySignedPayload<T>(
  token: string,
  secret: string,
): T | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(data).digest('base64url');
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function createSessionToken(userId: number, secret: string): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  return signPayload({ userId, exp }, secret);
}

export function parseSessionToken(
  token: string | undefined,
  secret: string,
): SessionPayload | null {
  if (!token) return null;
  const payload = verifySignedPayload<SessionPayload>(token, secret);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}
