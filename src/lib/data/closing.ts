// Closing lines: the last odds captured before puck drop for every game, and the closing price
// stored on each logged pick and bet so closing-line value can be shown.
import { sqlite } from "@/db";
import type { MarketOdds } from "@/lib/odds";
import { closingPrice, type OddsSnapshot } from "@/lib/clv";
import { DEFAULT_BLEND_WEIGHT, MIN_BLEND_FIT, fitBlendWeight } from "@/lib/model/blend";

export type { OddsSnapshot };

const strip = ({ sources: _sources, ...rest }: MarketOdds): OddsSnapshot => rest;

/**
 * Remember a game's current pre-game odds. Markets missing from this read keep their last price, so a
 * feed hiccup just before puck drop doesn't erase the closing line.
 */
export function saveSnapshot(game: { id: number; startTimeUTC: string; homeTeam: { abbrev: string }; awayTeam: { abbrev: string } }, market: MarketOdds, now = Date.now()) {
  const fresh = strip(market);
  if (!fresh.moneyline && !fresh.total && !fresh.puckline) return;
  const prev = loadSnapshot(game.id);
  const merged: OddsSnapshot = { ...prev, ...Object.fromEntries(Object.entries(fresh).filter(([, v]) => v !== undefined)) };
  sqlite
    .prepare(
      `INSERT INTO game_odds (game_id, start_utc, home, away, captured_at, odds) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id) DO UPDATE SET start_utc = excluded.start_utc, captured_at = excluded.captured_at, odds = excluded.odds`,
    )
    .run(game.id, game.startTimeUTC, game.homeTeam.abbrev, game.awayTeam.abbrev, now, JSON.stringify(merged));
}

export function loadSnapshot(gameId: number): OddsSnapshot | null {
  const r = sqlite.prepare("SELECT odds FROM game_odds WHERE game_id = ?").get(gameId) as { odds: string } | undefined;
  return r ? (JSON.parse(r.odds) as OddsSnapshot) : null;
}

/** Copy the closing price onto picks and bets whose game has started. Returns how many rows changed. */
export function fillClosing(now = Date.now()): number {
  const iso = new Date(now).toISOString();
  let n = 0;
  for (const table of ["picks", "bets"] as const) {
    const rows = sqlite
      .prepare(
        `SELECT t.id, t.market, t.selection, t.line, o.home, o.away, o.odds FROM ${table} t JOIN game_odds o ON o.game_id = t.game_id
         WHERE t.closing_odds IS NULL AND o.start_utc <= ?`,
      )
      .all(iso) as { id: number; market: string; selection: string; line: number | null; home: string; away: string; odds: string }[];
    const upd = sqlite.prepare(`UPDATE ${table} SET closing_odds = ?, closing_prob = ? WHERE id = ?`);
    for (const r of rows) {
      const c = closingPrice(JSON.parse(r.odds) as OddsSnapshot, r, r.market, r.selection, r.line);
      if (!c) continue;
      upd.run(c.odds, c.prob, r.id);
      n++;
    }
  }
  return n;
}

export interface BlendWeight {
  w: number;
  fitted: boolean;
  n: number; // graded moneyline picks with a closing price
}

/** The model's share in the pick probability: the default until enough closing lines are stored, then refit. */
export function blendWeight(): BlendWeight {
  const rows = sqlite
    .prepare(
      `SELECT model_prob AS model, closing_prob AS market, result FROM picks
       WHERE market = 'moneyline' AND closing_prob IS NOT NULL AND result IN ('win', 'loss')`,
    )
    .all() as { model: number; market: number; result: string }[];
  if (rows.length < MIN_BLEND_FIT) return { w: DEFAULT_BLEND_WEIGHT, fitted: false, n: rows.length };
  return { w: fitBlendWeight(rows.map((r) => ({ model: r.model, market: r.market, won: r.result === "win" }))), fitted: true, n: rows.length };
}
