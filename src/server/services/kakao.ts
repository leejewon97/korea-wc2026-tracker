import { getBaseUrl } from './notification-hash.js';
import type { KakaoFeedTemplate } from './notification-message.js';

const KAUTH_URL = 'https://kauth.kakao.com';
const KAPI_URL = 'https://kapi.kakao.com';

export interface KakaoTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token_expires_in?: number;
}

function getClientId(): string {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error('KAKAO_REST_API_KEY not configured');
  return key;
}

function getClientSecret(): string | undefined {
  return process.env.KAKAO_CLIENT_SECRET || undefined;
}

export function hasKakaoConfig(): boolean {
  return Boolean(process.env.KAKAO_REST_API_KEY);
}

/** Kakao JS SDK (공유하기). 미설정 시 REST API 키로 시도. */
export function getKakaoJavaScriptKey(): string | undefined {
  const jsKey = process.env.KAKAO_JAVASCRIPT_KEY?.trim();
  if (jsKey) return jsKey;
  return process.env.KAKAO_REST_API_KEY?.trim() || undefined;
}

export function getRedirectUri(): string {
  return `${getBaseUrl()}/api/auth/kakao/callback`;
}

export interface KakaoScopeInfo {
  id: string;
  display_name?: string;
  type?: string;
  using?: boolean;
  agreed?: boolean;
  revocable?: boolean;
}

export function hasTalkMessageInTokenScope(scope?: string): boolean {
  if (!scope) return false;
  return scope.split(/[\s,]+/).includes('talk_message');
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'talk_message',
    // Re-auth after unsubscribe must re-issue refresh_token (Kakao omits it otherwise).
    prompt: 'consent',
    state,
  });
  return `${KAUTH_URL}/oauth/authorize?${params}`;
}

/** 동의항목 추가 동의 — 이미 로그인한 사용자에게 talk_message만 재요청 */
export function buildAdditionalConsentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'talk_message',
    state,
  });
  return `${KAUTH_URL}/oauth/authorize?${params}`;
}

async function requestToken(
  body: Record<string, string>,
): Promise<KakaoTokenResponse> {
  const params = new URLSearchParams(body);
  const secret = getClientSecret();
  if (secret) {
    params.set('client_secret', secret);
  }

  const res = await fetch(`${KAUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kakao token error ${res.status}: ${text}`);
  }

  return (await res.json()) as KakaoTokenResponse;
}

export async function exchangeCode(code: string): Promise<KakaoTokenResponse> {
  return requestToken({
    grant_type: 'authorization_code',
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    code,
  });
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<KakaoTokenResponse> {
  return requestToken({
    grant_type: 'refresh_token',
    client_id: getClientId(),
    refresh_token: refreshToken,
  });
}

/** Disconnect this app from the user's Kakao account (forces re-consent on next login). */
export async function unlinkWithRefreshToken(
  refreshToken: string,
): Promise<void> {
  const tokenRes = await refreshAccessToken(refreshToken);
  const res = await fetch(`${KAPI_URL}/v1/user/unlink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenRes.access_token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kakao unlink error ${res.status}: ${text}`);
  }
}

export async function getUserScopes(
  accessToken: string,
): Promise<KakaoScopeInfo[]> {
  const res = await fetch(`${KAPI_URL}/v2/user/scopes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kakao scopes error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { scopes?: KakaoScopeInfo[] };
  return data.scopes ?? [];
}

export async function isTalkMessageAgreed(accessToken: string): Promise<boolean> {
  const scopes = await getUserScopes(accessToken);
  const talk = scopes.find((scope) => scope.id === 'talk_message');
  return talk?.agreed === true;
}

export async function getKakaoUserId(accessToken: string): Promise<string> {
  const res = await fetch(`${KAPI_URL}/v1/user/access_token_info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kakao user info error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id: number };
  return String(data.id);
}

export async function sendMemoToMe(
  accessToken: string,
  templateObject: KakaoFeedTemplate,
): Promise<void> {
  const body = new URLSearchParams({
    template_object: JSON.stringify(templateObject),
  });

  const res = await fetch(`${KAPI_URL}/v2/api/talk/memo/default/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kakao memo send error ${res.status}: ${text}`);
  }
}
