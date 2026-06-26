import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Hono } from 'hono';
import {
  consumeOAuthState,
  getUserById,
  saveOAuthState,
  upsertUser,
  type UserRow,
} from '../db/index.js';
import {
  buildAdditionalConsentUrl,
  buildAuthorizeUrl,
  exchangeCode,
  getKakaoUserId,
  hasKakaoConfig,
  isTalkMessageAgreed,
  refreshAccessToken,
  type KakaoTokenResponse,
} from '../services/kakao.js';
import { unsubscribeUser } from '../services/unsubscribe-user.js';
import {
  createOAuthState,
  createSessionToken,
  OAUTH_STATE_COOKIE,
  parseSessionToken,
  SESSION_COOKIE,
} from '../services/session.js';
import { recordSubscriberFingerprint } from '../services/subscriber-fingerprint.js';
import { encryptToken, decryptToken } from '../services/token-crypto.js';
import { hasPushConfig } from '../services/push.js';
import { userHasPushSubscription } from './push.js';

export const authRoutes = new Hono();

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return secret;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function cookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'Lax';
  path: string;
} {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'Lax',
    path: '/',
  };
}

function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: 30 * 24 * 60 * 60,
  });
}

function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, cookieOptions());
}

function clearOAuthStateCookie(c: Context): void {
  deleteCookie(c, OAUTH_STATE_COOKIE, cookieOptions());
}

function redirectHome(c: Context, query: Record<string, string>): Response {
  const qs = new URLSearchParams(query).toString();
  return c.redirect(qs ? `/?${qs}` : '/');
}

function isOAuthStateValid(
  state: string | undefined,
  savedState: string | undefined,
): boolean {
  if (!state) return false;
  if (consumeOAuthState(state)) return true;
  return Boolean(savedState && state === savedState);
}

function startOAuthRedirect(
  c: Context,
  buildUrl: (state: string) => string,
): Response {
  const state = createOAuthState();
  saveOAuthState(state);
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    ...cookieOptions(),
    maxAge: 600,
  });
  return c.redirect(buildUrl(state));
}

async function checkUserTalkMessageAgreed(user: UserRow): Promise<boolean> {
  try {
    const refreshToken = decryptToken(user.refresh_token_enc);
    const tokenRes = await refreshAccessToken(refreshToken);
    return isTalkMessageAgreed(tokenRes.access_token);
  } catch (err) {
    console.warn(`[auth] talk_message scope check failed for user ${user.id}:`, err);
    return false;
  }
}

async function finalizeKakaoSubscribe(
  c: Context,
  tokens: KakaoTokenResponse,
): Promise<Response> {
  if (!(await isTalkMessageAgreed(tokens.access_token))) {
    return redirectHome(c, { auth_error: 'scope_required' });
  }

  if (!tokens.refresh_token) {
    throw new Error('Kakao did not return refresh_token');
  }

  const kakaoUserId = await getKakaoUserId(tokens.access_token);
  const refreshEnc = encryptToken(tokens.refresh_token);
  const user = upsertUser(kakaoUserId, refreshEnc);
  const stats = recordSubscriberFingerprint(kakaoUserId);
  if (stats.isNew) {
    console.log(`[stats] unique_subscribers=${stats.uniqueSubscribers}`);
  }
  const sessionToken = createSessionToken(user.id, getSessionSecret());
  setSessionCookie(c, sessionToken);

  return redirectHome(c, { subscribed: '1' });
}

authRoutes.get('/auth/me', async (c) => {
  const pushEnabled = hasPushConfig();

  if (!hasKakaoConfig()) {
    return c.json({
      subscribed: false,
      talkMessageAgreed: false,
      kakaoEnabled: false,
      pushEnabled,
      pushSubscribed: false,
    });
  }

  const session = parseSessionToken(
    getCookie(c, SESSION_COOKIE),
    getSessionSecret(),
  );
  if (!session) {
    return c.json({
      subscribed: false,
      talkMessageAgreed: false,
      kakaoEnabled: true,
      pushEnabled,
      pushSubscribed: false,
    });
  }

  const user = getUserById(session.userId);
  const subscribed = Boolean(user);
  const talkMessageAgreed = user
    ? await checkUserTalkMessageAgreed(user)
    : false;

  return c.json({
    subscribed,
    talkMessageAgreed,
    kakaoEnabled: true,
    pushEnabled,
    pushSubscribed: user ? userHasPushSubscription(user.id) : false,
  });
});

authRoutes.get('/auth/kakao', (c) => {
  if (!hasKakaoConfig()) {
    return c.json({ error: 'Kakao OAuth not configured' }, 503);
  }

  return startOAuthRedirect(c, buildAuthorizeUrl);
});

authRoutes.get('/auth/kakao/consent', (c) => {
  if (!hasKakaoConfig()) {
    return c.json({ error: 'Kakao OAuth not configured' }, 503);
  }

  const session = parseSessionToken(
    getCookie(c, SESSION_COOKIE),
    getSessionSecret(),
  );
  if (!session || !getUserById(session.userId)) {
    return redirectHome(c, { auth_error: 'login_required' });
  }

  return startOAuthRedirect(c, buildAdditionalConsentUrl);
});

authRoutes.get('/auth/kakao/callback', async (c) => {
  if (!hasKakaoConfig()) {
    return redirectHome(c, { auth_error: 'not_configured' });
  }

  const kakaoError = c.req.query('error');
  const code = c.req.query('code');
  const state = c.req.query('state');
  const savedState = getCookie(c, OAUTH_STATE_COOKIE);

  clearOAuthStateCookie(c);

  if (kakaoError) {
    console.warn('[auth] Kakao OAuth error:', kakaoError);
    return redirectHome(c, { auth_error: kakaoError });
  }

  if (!code || !isOAuthStateValid(state, savedState)) {
    console.warn('[auth] Invalid OAuth state', {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hadSavedState: Boolean(savedState),
    });
    return redirectHome(c, { auth_error: 'invalid_state' });
  }

  try {
    const tokens = await exchangeCode(code);
    return finalizeKakaoSubscribe(c, tokens);
  } catch (err) {
    console.error('[auth] Kakao callback error:', err);
    return redirectHome(c, { auth_error: 'login_failed' });
  }
});

authRoutes.post('/auth/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.delete('/auth/unsubscribe', async (c) => {
  const session = parseSessionToken(
    getCookie(c, SESSION_COOKIE),
    getSessionSecret(),
  );
  if (!session) {
    return c.json({ error: 'Not subscribed' }, 401);
  }

  const user = getUserById(session.userId);
  if (user) {
    await unsubscribeUser(user);
  }

  clearSessionCookie(c);
  return c.json({ ok: true });
});
