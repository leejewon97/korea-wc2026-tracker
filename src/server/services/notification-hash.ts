import { createHash } from 'node:crypto';
import type { StatusResponse } from '../../shared/types.js';

export const LAST_NOTIFICATION_HASH_KEY = 'last_notification_hash';

export function computeNotificationHash(status: StatusResponse): string {
  const payload = {
    metCount: status.metCount,
    finishedCount: status.finishedCount,
    matches: status.matches.map((m) => ({
      id: m.id,
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      conditionMet: m.conditionMet,
    })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function getBaseUrl(): string {
  const base = process.env.BASE_URL ?? 'http://localhost:3000';
  return base.replace(/\/$/, '');
}
