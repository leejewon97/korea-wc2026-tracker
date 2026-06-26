import { createHmac } from 'node:crypto';
import {
  getActiveSubscriberCount,
  getUniqueSubscriberCount,
  insertSubscriberFingerprint,
} from '../db/index.js';

function getFingerprintKey(): string {
  const key = process.env.SESSION_SECRET;
  if (!key) throw new Error('SESSION_SECRET not configured');
  return key;
}

export function hashKakaoUserId(kakaoUserId: string): string {
  return createHmac('sha256', getFingerprintKey())
    .update(kakaoUserId, 'utf8')
    .digest('hex');
}

export function recordSubscriberFingerprint(kakaoUserId: string): {
  isNew: boolean;
  uniqueSubscribers: number;
} {
  const isNew = insertSubscriberFingerprint(hashKakaoUserId(kakaoUserId));
  return {
    isNew,
    uniqueSubscribers: getUniqueSubscriberCount(),
  };
}

export function getSubscriberStats(): {
  uniqueSubscribers: number;
  activeSubscribers: number;
} {
  return {
    uniqueSubscribers: getUniqueSubscriberCount(),
    activeSubscribers: getActiveSubscriberCount(),
  };
}
