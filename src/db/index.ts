import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
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
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, result TEXT, graded_at INTEGER);
CREATE INDEX IF NOT EXISTS picks_game_idx ON picks(game_id);
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
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_params (key TEXT PRIMARY KEY, value TEXT NOT NULL, fitted_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, finished_at INTEGER,
  games_added INTEGER NOT NULL DEFAULT 0, message TEXT);
`;

function open() {
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "puck-edge.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(DDL);
  return sqlite;
}

// Reuse one connection across Next.js hot reloads.
const g = globalThis as unknown as { __puckSqlite?: Database.Database };
export const sqlite = g.__puckSqlite ?? (g.__puckSqlite = open());
export const db = drizzle(sqlite, { schema });
export { schema };
