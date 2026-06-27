import { randomBytes, createHmac } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import {
  getTotalPageViewCount,
  getUniqueVisitorCount,
  recordVisitorPageView,
} from '../db/index.js';
import { getSubscriberStats } from './subscriber-fingerprint.js';

export const VISITOR_COOKIE = 'wc_visitor';
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function getFingerprintKey(): string {
  const key = process.env.SESSION_SECRET;
  if (!key) throw new Error('SESSION_SECRET not configured');
  return key;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function hashVisitorId(visitorId: string): string {
  return createHmac('sha256', getFingerprintKey())
    .update(visitorId, 'utf8')
    .digest('hex');
}

function createVisitorId(): string {
  return randomBytes(16).toString('hex');
}

function ensureVisitorCookie(c: Context): string {
  const existing = getCookie(c, VISITOR_COOKIE);
  if (existing) return existing;

  const visitorId = createVisitorId();
  setCookie(c, VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'Lax',
    path: '/',
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
  return visitorId;
}

export function recordPageVisit(c: Context): {
  isNewVisitor: boolean;
  uniqueVisitors: number;
  totalPageViews: number;
} {
  const visitorId = ensureVisitorCookie(c);
  const idHash = hashVisitorId(visitorId);
  const isNewVisitor = recordVisitorPageView(idHash);
  const stats = getVisitorStats();

  if (isNewVisitor) {
    console.log(
      `[stats] unique_visitors=${stats.uniqueVisitors} total_page_views=${stats.totalPageViews}`,
    );
  }

  return { isNewVisitor, ...stats };
}

export function getVisitorStats(): {
  uniqueVisitors: number;
  totalPageViews: number;
} {
  return {
    uniqueVisitors: getUniqueVisitorCount(),
    totalPageViews: getTotalPageViewCount(),
  };
}

export function getAdminStats(): {
  uniqueSubscribers: number;
  activeSubscribers: number;
  uniqueVisitors: number;
  totalPageViews: number;
} {
  return {
    ...getSubscriberStats(),
    ...getVisitorStats(),
  };
}
