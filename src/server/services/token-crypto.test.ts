import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { encryptToken, decryptToken, generateEncryptionKeyHex } from './token-crypto.js';

describe('token-crypto', () => {
  const original = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = generateEncryptionKeyHex();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = original;
    }
  });

  it('round-trips refresh token', () => {
    const plain = 'kakao-refresh-token-abc123';
    const enc = encryptToken(plain);
    expect(decryptToken(enc)).toBe(plain);
  });

  it('rejects invalid ciphertext', () => {
    expect(() => decryptToken('bad.payload.here')).toThrow();
  });
});
