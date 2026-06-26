import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildAdditionalConsentUrl,
  buildAuthorizeUrl,
  hasTalkMessageInTokenScope,
} from './kakao.js';

describe('buildAuthorizeUrl', () => {
  beforeEach(() => {
    process.env.KAKAO_REST_API_KEY = 'test-rest-key';
    process.env.BASE_URL = 'https://example.test';
  });

  afterEach(() => {
    delete process.env.KAKAO_REST_API_KEY;
    delete process.env.BASE_URL;
  });

  it('includes prompt=consent so re-subscribe gets a refresh token', () => {
    const url = buildAuthorizeUrl('state-123');
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://kauth.kakao.com');
    expect(parsed.pathname).toBe('/oauth/authorize');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    expect(parsed.searchParams.get('scope')).toBe('talk_message');
    expect(parsed.searchParams.get('state')).toBe('state-123');
  });

  it('builds additional consent URL without prompt=consent', () => {
    const url = buildAdditionalConsentUrl('state-consent');
    const parsed = new URL(url);

    expect(parsed.searchParams.get('scope')).toBe('talk_message');
    expect(parsed.searchParams.get('state')).toBe('state-consent');
    expect(parsed.searchParams.get('prompt')).toBeNull();
  });
});

describe('hasTalkMessageInTokenScope', () => {
  it('detects talk_message in scope string', () => {
    expect(hasTalkMessageInTokenScope('talk_message')).toBe(true);
    expect(hasTalkMessageInTokenScope('profile talk_message')).toBe(true);
    expect(hasTalkMessageInTokenScope('profile')).toBe(false);
    expect(hasTalkMessageInTokenScope(undefined)).toBe(false);
  });
});
