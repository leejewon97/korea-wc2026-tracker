import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MatchStatus } from '../../shared/types.js';

export interface MatchRow {
  match_id: number;
  api_fixture_id: number | null;
  kickoff_kst: string;
  home_score: number | null;
  away_score: number | null;
  condition_met: number | null;
  status: MatchStatus;
  finished_at: string | null;
  polling_started_at: string | null;
  poll_attempts: number;
  poll_failed: number;
  last_poll_at: string | null;
  kickoff_notified: number;
}

export interface UserRow {
  id: number;
  kakao_user_id: string;
  refresh_token_enc: string;
  created_at: string;
  updated_at: string;
}

export interface PushSubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

let db: DatabaseSync | null = null;

export function getDbPath(): string {
  return process.env.DATABASE_PATH ?? './data/app.db';
}

export function getDb(): DatabaseSync {
  if (db) return db;

  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  initSchema(db);
  return db;
}

function initSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS match_states (
      match_id INTEGER PRIMARY KEY,
      api_fixture_id INTEGER,
      kickoff_kst TEXT NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      condition_met INTEGER,
      status TEXT NOT NULL DEFAULT 'NS',
      finished_at TEXT,
      polling_started_at TEXT,
      poll_attempts INTEGER NOT NULL DEFAULT 0,
      poll_failed INTEGER NOT NULL DEFAULT 0,
      last_poll_at TEXT,
      kickoff_notified INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kakao_user_id TEXT NOT NULL UNIQUE,
      refresh_token_enc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      notification_hash TEXT NOT NULL,
      payload_summary TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      success INTEGER NOT NULL,
      error_message TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subscriber_fingerprints (
      id_hash TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visitor_fingerprints (
      id_hash TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      page_views INTEGER NOT NULL DEFAULT 1
    );
  `);

  migrateSchema(database);
}

function migrateSchema(database: DatabaseSync): void {
  const columns = [
    'poll_attempts INTEGER NOT NULL DEFAULT 0',
    'poll_failed INTEGER NOT NULL DEFAULT 0',
    'last_poll_at TEXT',
    'kickoff_notified INTEGER NOT NULL DEFAULT 0',
  ];
  for (const col of columns) {
    try {
      database.exec(`ALTER TABLE match_states ADD COLUMN ${col}`);
    } catch {
      // column already exists
    }
  }
}

export function getAllMatchStates(): MatchRow[] {
  return getDb()
    .prepare('SELECT * FROM match_states ORDER BY match_id')
    .all() as unknown as MatchRow[];
}

export function getMatchState(matchId: number): MatchRow | undefined {
  return getDb()
    .prepare('SELECT * FROM match_states WHERE match_id = ?')
    .get(matchId) as MatchRow | undefined;
}

export function setAppMeta(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run({ key, value });
}

export function deleteAppMeta(key: string): void {
  getDb().prepare('DELETE FROM app_meta WHERE key = ?').run(key);
}

export function getAppMeta(key: string): string | undefined {
  const row = getDb()
    .prepare('SELECT value FROM app_meta WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function upsertMatchState(row: {
  matchId: number;
  apiFixtureId?: number | null;
  kickoffKst?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  conditionMet?: boolean | null;
  status?: MatchStatus;
  finishedAt?: string | null;
  pollingStartedAt?: string | null;
  pollAttempts?: number;
  pollFailed?: boolean;
  lastPollAt?: string | null;
}): void {
  const existing = getMatchState(row.matchId);
  const conditionMet =
    row.conditionMet === undefined
      ? (existing?.condition_met ?? null)
      : row.conditionMet === null
        ? null
        : row.conditionMet
          ? 1
          : 0;

  const pollFailed =
    row.pollFailed === undefined
      ? (existing?.poll_failed ?? 0)
      : row.pollFailed
        ? 1
        : 0;

  getDb()
    .prepare(
      `INSERT INTO match_states (
        match_id, api_fixture_id, kickoff_kst,
        home_score, away_score, condition_met,
        status, finished_at, polling_started_at,
        poll_attempts, poll_failed, last_poll_at
      ) VALUES (
        @match_id, @api_fixture_id, @kickoff_kst,
        @home_score, @away_score, @condition_met,
        @status, @finished_at, @polling_started_at,
        @poll_attempts, @poll_failed, @last_poll_at
      )
      ON CONFLICT(match_id) DO UPDATE SET
        api_fixture_id = COALESCE(excluded.api_fixture_id, match_states.api_fixture_id),
        kickoff_kst = COALESCE(excluded.kickoff_kst, match_states.kickoff_kst),
        home_score = COALESCE(excluded.home_score, match_states.home_score),
        away_score = COALESCE(excluded.away_score, match_states.away_score),
        condition_met = excluded.condition_met,
        status = excluded.status,
        finished_at = COALESCE(excluded.finished_at, match_states.finished_at),
        polling_started_at = COALESCE(excluded.polling_started_at, match_states.polling_started_at),
        poll_attempts = COALESCE(excluded.poll_attempts, match_states.poll_attempts),
        poll_failed = excluded.poll_failed,
        last_poll_at = COALESCE(excluded.last_poll_at, match_states.last_poll_at)`,
    )
    .run({
      match_id: row.matchId,
      api_fixture_id: row.apiFixtureId ?? existing?.api_fixture_id ?? null,
      kickoff_kst: row.kickoffKst ?? existing?.kickoff_kst ?? '',
      home_score: row.homeScore ?? existing?.home_score ?? null,
      away_score: row.awayScore ?? existing?.away_score ?? null,
      condition_met: conditionMet,
      status: row.status ?? existing?.status ?? 'NS',
      finished_at: row.finishedAt ?? existing?.finished_at ?? null,
      polling_started_at:
        row.pollingStartedAt ?? existing?.polling_started_at ?? null,
      poll_attempts: row.pollAttempts ?? existing?.poll_attempts ?? 0,
      poll_failed: pollFailed,
      last_poll_at: row.lastPollAt ?? existing?.last_poll_at ?? null,
    });
}

export function resetMatchState(matchId: number): boolean {
  const result = getDb()
    .prepare(
      `UPDATE match_states SET
        home_score = NULL,
        away_score = NULL,
        condition_met = NULL,
        status = 'NS',
        finished_at = NULL,
        poll_failed = 0,
        poll_attempts = 0,
        polling_started_at = NULL,
        last_poll_at = NULL,
        kickoff_notified = 0
      WHERE match_id = ?`,
    )
    .run(matchId);
  return result.changes > 0;
}

const FINISHED_STATUSES: MatchStatus[] = ['FT', 'AET', 'PEN', 'MANUAL'];

export function isMatchFinishedStatus(status: MatchStatus): boolean {
  return FINISHED_STATUSES.includes(status);
}

export function tryClaimKickoffNotification(matchId: number): boolean {
  const result = getDb()
    .prepare(
      `UPDATE match_states SET kickoff_notified = 1
       WHERE match_id = ?
         AND kickoff_notified = 0
         AND status NOT IN ('FT', 'AET', 'PEN', 'MANUAL')`,
    )
    .run(matchId);
  return result.changes > 0;
}

export function upsertUser(
  kakaoUserId: string,
  refreshTokenEnc: string,
): UserRow {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO users (kakao_user_id, refresh_token_enc, created_at, updated_at)
       VALUES (@kakao_user_id, @refresh_token_enc, @now, @now)
       ON CONFLICT(kakao_user_id) DO UPDATE SET
         refresh_token_enc = excluded.refresh_token_enc,
         updated_at = excluded.updated_at`,
    )
    .run({
      kakao_user_id: kakaoUserId,
      refresh_token_enc: refreshTokenEnc,
      now,
    });

  const row = getDb()
    .prepare('SELECT * FROM users WHERE kakao_user_id = ?')
    .get(kakaoUserId) as unknown as UserRow;
  return row;
}

export function getUserById(id: number): UserRow | undefined {
  return getDb()
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(id) as UserRow | undefined;
}

export function getAllUsers(): UserRow[] {
  return getDb()
    .prepare('SELECT * FROM users ORDER BY id')
    .all() as unknown as UserRow[];
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function saveOAuthState(state: string): void {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString();
  const database = getDb();
  database.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(cutoff);
  database
    .prepare('INSERT INTO oauth_states (state, created_at) VALUES (?, ?)')
    .run(state, now);
}

export function consumeOAuthState(state: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM oauth_states WHERE state = ?')
    .run(state);
  return result.changes > 0;
}

export function deleteUser(id: number): boolean {
  const database = getDb();
  database.exec('BEGIN');
  try {
    database.prepare('DELETE FROM notification_log WHERE user_id = ?').run(id);
    const result = database.prepare('DELETE FROM users WHERE id = ?').run(id);
    database.exec('COMMIT');
    return result.changes > 0;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

export function insertNotificationLog(row: {
  userId: number;
  channel: string;
  notificationHash: string;
  payloadSummary: string;
  success: boolean;
  errorMessage?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO notification_log (
        user_id, channel, notification_hash, payload_summary,
        sent_at, success, error_message
      ) VALUES (
        @user_id, @channel, @notification_hash, @payload_summary,
        @sent_at, @success, @error_message
      )`,
    )
    .run({
      user_id: row.userId,
      channel: row.channel,
      notification_hash: row.notificationHash,
      payload_summary: row.payloadSummary,
      sent_at: new Date().toISOString(),
      success: row.success ? 1 : 0,
      error_message: row.errorMessage ?? null,
    });
}

export function upsertPushSubscription(row: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}): PushSubscriptionRow {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
       VALUES (@user_id, @endpoint, @p256dh, @auth, @now)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth`,
    )
    .run({
      user_id: row.userId,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      now,
    });

  return getDb()
    .prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?')
    .get(row.endpoint) as unknown as PushSubscriptionRow;
}

export function getPushSubscriptionsByUserId(
  userId: number,
): PushSubscriptionRow[] {
  return getDb()
    .prepare(
      'SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY id',
    )
    .all(userId) as unknown as PushSubscriptionRow[];
}

export function getAllPushSubscriptions(): PushSubscriptionRow[] {
  return getDb()
    .prepare('SELECT * FROM push_subscriptions ORDER BY id')
    .all() as unknown as PushSubscriptionRow[];
}

export function deletePushSubscription(endpoint: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
    .run(endpoint);
  return result.changes > 0;
}

export function deletePushSubscriptionsByUserId(userId: number): number {
  const result = getDb()
    .prepare('DELETE FROM push_subscriptions WHERE user_id = ?')
    .run(userId);
  return Number(result.changes);
}

export function insertSubscriberFingerprint(idHash: string): boolean {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO subscriber_fingerprints (id_hash, first_seen_at)
       VALUES (?, ?)`,
    )
    .run(idHash, now);
  return result.changes > 0;
}

export function getUniqueSubscriberCount(): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM subscriber_fingerprints')
    .get() as { n: number };
  return row.n;
}

export function getActiveSubscriberCount(): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM users')
    .get() as { n: number };
  return row.n;
}

export function recordVisitorPageView(idHash: string): boolean {
  const now = new Date().toISOString();
  const database = getDb();
  const insertResult = database
    .prepare(
      `INSERT OR IGNORE INTO visitor_fingerprints (id_hash, first_seen_at, last_seen_at, page_views)
       VALUES (?, ?, ?, 1)`,
    )
    .run(idHash, now, now);

  if (insertResult.changes > 0) {
    return true;
  }

  database
    .prepare(
      `UPDATE visitor_fingerprints
       SET last_seen_at = ?, page_views = page_views + 1
       WHERE id_hash = ?`,
    )
    .run(now, idHash);
  return false;
}

export function getUniqueVisitorCount(): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM visitor_fingerprints')
    .get() as { n: number };
  return row.n;
}

export function getTotalPageViewCount(): number {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(page_views), 0) AS n FROM visitor_fingerprints')
    .get() as { n: number };
  return row.n;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
