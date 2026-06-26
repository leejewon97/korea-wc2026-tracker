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
      polling_started_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
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

export function upsertMatchState(row: {
  matchId: number;
  apiFixtureId?: number | null;
  kickoffKst: string;
  homeScore?: number | null;
  awayScore?: number | null;
  conditionMet?: boolean | null;
  status?: MatchStatus;
  finishedAt?: string | null;
  pollingStartedAt?: string | null;
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

  getDb()
    .prepare(
      `INSERT INTO match_states (
        match_id, api_fixture_id, kickoff_kst,
        home_score, away_score, condition_met,
        status, finished_at, polling_started_at
      ) VALUES (
        @match_id, @api_fixture_id, @kickoff_kst,
        @home_score, @away_score, @condition_met,
        @status, @finished_at, @polling_started_at
      )
      ON CONFLICT(match_id) DO UPDATE SET
        api_fixture_id = COALESCE(excluded.api_fixture_id, match_states.api_fixture_id),
        kickoff_kst = excluded.kickoff_kst,
        home_score = COALESCE(excluded.home_score, match_states.home_score),
        away_score = COALESCE(excluded.away_score, match_states.away_score),
        condition_met = excluded.condition_met,
        status = excluded.status,
        finished_at = COALESCE(excluded.finished_at, match_states.finished_at),
        polling_started_at = COALESCE(excluded.polling_started_at, match_states.polling_started_at)`,
    )
    .run({
      match_id: row.matchId,
      api_fixture_id: row.apiFixtureId ?? existing?.api_fixture_id ?? null,
      kickoff_kst: row.kickoffKst,
      home_score: row.homeScore ?? existing?.home_score ?? null,
      away_score: row.awayScore ?? existing?.away_score ?? null,
      condition_met: conditionMet,
      status: row.status ?? existing?.status ?? 'NS',
      finished_at: row.finishedAt ?? existing?.finished_at ?? null,
      polling_started_at:
        row.pollingStartedAt ?? existing?.polling_started_at ?? null,
    });
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
