import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

// Tables are created on first use so `npm run dev` works with no migration step.
const DDL = `
CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY, season INTEGER NOT NULL, game_type INTEGER NOT NULL, date TEXT NOT NULL, start_utc TEXT NOT NULL,
  away TEXT NOT NULL, home TEXT NOT NULL, away_score INTEGER NOT NULL, home_score INTEGER NOT NULL,
  away_sog INTEGER NOT NULL, home_sog INTEGER NOT NULL, last_period_type TEXT NOT NULL,
  away_goalie_id INTEGER, home_goalie_id INTEGER, venue TEXT);
CREATE INDEX IF NOT EXISTS games_date_idx ON games(date);
CREATE INDEX IF NOT EXISTS games_season_idx ON games(season);
CREATE TABLE IF NOT EXISTS player_games (
  game_id INTEGER NOT NULL, player_id INTEGER NOT NULL, name TEXT NOT NULL, team TEXT NOT NULL, opponent TEXT NOT NULL,
  is_home INTEGER NOT NULL, date TEXT NOT NULL, season INTEGER NOT NULL, position TEXT NOT NULL,
  goals INTEGER NOT NULL DEFAULT 0, assists INTEGER NOT NULL DEFAULT 0, points INTEGER NOT NULL DEFAULT 0,
  shots INTEGER NOT NULL DEFAULT 0, pp_goals INTEGER NOT NULL DEFAULT 0, toi_sec INTEGER NOT NULL DEFAULT 0,
  shots_against INTEGER, saves INTEGER, goals_against INTEGER, starter INTEGER,
  PRIMARY KEY (game_id, player_id));
CREATE INDEX IF NOT EXISTS pg_player_idx ON player_games(player_id, date);
CREATE INDEX IF NOT EXISTS pg_team_idx ON player_games(team, date);
CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, game_date TEXT NOT NULL, start_utc TEXT NOT NULL,
  market TEXT NOT NULL, selection TEXT NOT NULL, selection_label TEXT NOT NULL, line REAL,
  model_prob REAL NOT NULL, market_prob REAL, odds_decimal REAL, edge REAL, confidence TEXT NOT NULL,
  is_value INTEGER NOT NULL DEFAULT 0, is_best INTEGER NOT NULL DEFAULT 0, reasons TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, result TEXT, graded_at INTEGER, context TEXT);
CREATE INDEX IF NOT EXISTS picks_game_idx ON picks(game_id);
CREATE TABLE IF NOT EXISTS pick_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, market TEXT NOT NULL, at INTEGER NOT NULL,
  from_market TEXT NOT NULL, from_selection TEXT NOT NULL, from_line REAL, from_label TEXT NOT NULL,
  to_market TEXT NOT NULL, to_selection TEXT NOT NULL, to_line REAL, to_label TEXT NOT NULL, reasons TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pick_changes_game_idx ON pick_changes(game_id);
CREATE UNIQUE INDEX IF NOT EXISTS picks_unique ON picks(game_id, market, selection, IFNULL(line, -1));
CREATE TABLE IF NOT EXISTS backtest (
  game_id INTEGER PRIMARY KEY, season INTEGER NOT NULL, date TEXT NOT NULL, home_win_prob REAL NOT NULL,
  home_won INTEGER NOT NULL, exp_total REAL NOT NULL, actual_total INTEGER NOT NULL,
  over55_prob REAL NOT NULL, home_cover15_prob REAL NOT NULL);
CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, game_id INTEGER NOT NULL, game_date TEXT NOT NULL,
  game_label TEXT NOT NULL, market TEXT NOT NULL, selection TEXT NOT NULL, selection_label TEXT NOT NULL, line REAL,
  odds_decimal REAL NOT NULL, stake REAL NOT NULL, status TEXT NOT NULL DEFAULT 'open', profit REAL,
  settled_at INTEGER, notes TEXT);
CREATE TABLE IF NOT EXISTS game_details (game_id INTEGER PRIMARY KEY, goals TEXT NOT NULL, stars TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_params (key TEXT PRIMARY KEY, value TEXT NOT NULL, fitted_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, finished_at INTEGER,
  games_added INTEGER NOT NULL DEFAULT 0, message TEXT);
`;

/**
 * Thin wrapper over Node's built-in SQLite (node:sqlite, Node 22.13+), so there's no native
 * module to compile on install. Exposes the small better-sqlite3-style API the app uses.
 */
type Param = string | number | bigint | null | Uint8Array;
type Params = Param[] | [Record<string, Param | undefined>];

export interface Statement {
  get(...params: Params): unknown;
  all(...params: Params): unknown[];
  run(...params: Params): { changes: number | bigint; lastInsertRowid: number | bigint };
}

export interface Sqlite {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
}

function wrap(raw: DatabaseSync): Sqlite {
  let depth = 0;
  return {
    prepare(sql) {
      const st = raw.prepare(sql);
      st.setAllowBareNamedParameters(true); // { id: 1 } binds @id
      st.setAllowUnknownNamedParameters(true); // extra keys in a params object are ignored
      // node:sqlite rejects undefined; treat it as NULL like better-sqlite3 callers expect.
      const fix = (params: Params): Param[] =>
        params.length === 1 && params[0] !== null && typeof params[0] === "object" && !(params[0] instanceof Uint8Array)
          ? [Object.fromEntries(Object.entries(params[0]).map(([k, v]) => [k, v === undefined ? null : v])) as unknown as Param]
          : (params as Param[]);
      return {
        get: (...p) => st.get(...(fix(p) as never[])),
        all: (...p) => st.all(...(fix(p) as never[])),
        run: (...p) => st.run(...(fix(p) as never[])),
      };
    },
    exec: (sql) => raw.exec(sql),
    transaction(fn) {
      return () => {
        // Nested calls join the outer transaction.
        if (depth > 0) return fn();
        depth++;
        // IMMEDIATE takes the write lock up front, so busy_timeout applies while `npm run sync`
        // writes; a deferred BEGIN that reads then writes fails at once with "database is locked".
        raw.exec("BEGIN IMMEDIATE");
        try {
          const out = fn();
          raw.exec("COMMIT");
          return out;
        } catch (e) {
          raw.exec("ROLLBACK");
          throw e;
        } finally {
          depth--;
        }
      };
    },
  };
}

function open(): Sqlite {
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "puck-edge.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  raw.exec(DDL);
  // Columns added after the first release; CREATE TABLE IF NOT EXISTS doesn't touch existing tables.
  const has = (table: string, col: string) => (raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
  if (!has("picks", "context")) raw.exec("ALTER TABLE picks ADD COLUMN context TEXT");
  return wrap(raw);
}

// Reuse one connection across Next.js hot reloads.
const g = globalThis as unknown as { __puckSqlite?: Sqlite };
export const sqlite = g.__puckSqlite ?? (g.__puckSqlite = open());

// Drizzle on top of the same connection (via its proxy driver), typed with ./schema.
export const db = drizzle(
  async (sql, params, method) => {
    const st = sqlite.prepare(sql);
    if (method === "run") {
      st.run(...(params as Param[]));
      return { rows: [] };
    }
    const toArrays = (r: unknown) => Object.values(r as Record<string, unknown>);
    if (method === "get") {
      const r = st.get(...(params as Param[]));
      return { rows: r ? (toArrays(r) as never) : (undefined as never) };
    }
    return { rows: st.all(...(params as Param[])).map(toArrays) as never };
  },
  { schema },
);
export { schema };
