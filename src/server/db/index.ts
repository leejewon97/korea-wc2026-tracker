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
      last_poll_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  migrateSchema(database);
}

function migrateSchema(database: DatabaseSync): void {
  const columns = [
    'poll_attempts INTEGER NOT NULL DEFAULT 0',
    'poll_failed INTEGER NOT NULL DEFAULT 0',
    'last_poll_at TEXT',
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
        last_poll_at = NULL
      WHERE match_id = ?`,
    )
    .run(matchId);
  return result.changes > 0;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
