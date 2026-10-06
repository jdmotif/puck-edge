// Grades model picks and settles the user's bets against stored final scores.
import { sqlite } from "@/db";
import { outcomeFor, profitFor, type GameResult, type Market, type Outcome } from "./outcome";

export { MARKET_LABELS, outcomeFor, profitFor, type Market, type Outcome } from "./outcome";

const gameStmt = () =>
  sqlite.prepare("SELECT home, away, home_score AS homeScore, away_score AS awayScore FROM games WHERE id = ?");
const playerStmt = () => sqlite.prepare("SELECT goals, points FROM player_games WHERE game_id = ? AND player_id = ?");

function settle(gameId: number, market: Market, selection: string, line: number | null): Outcome | null {
  const game = gameStmt().get(gameId) as GameResult | undefined;
  if (!game) return null; // not final / not ingested yet
  const player = market.startsWith("prop_")
    ? ((playerStmt().get(gameId, Number(selection)) as { goals: number; points: number } | undefined) ?? null)
    : undefined;
  return outcomeFor(market, selection, line, game, player);
}

export function gradePicks(): number {
  const open = sqlite.prepare("SELECT id, game_id, market, selection, line FROM picks WHERE result IS NULL").all() as {
    id: number;
    game_id: number;
    market: Market;
    selection: string;
    line: number | null;
  }[];
  const upd = sqlite.prepare("UPDATE picks SET result = ?, graded_at = ? WHERE id = ?");
  let n = 0;
  for (const p of open) {
    const r = settle(p.game_id, p.market, p.selection, p.line);
    if (r) {
      upd.run(r, Date.now(), p.id);
      n++;
    }
  }
  return n;
}

export function settleBets(): number {
  const open = sqlite.prepare("SELECT id, game_id, market, selection, line, stake, odds_decimal FROM bets WHERE status = 'open'").all() as {
    id: number;
    game_id: number;
    market: Market;
    selection: string;
    line: number | null;
    stake: number;
    odds_decimal: number;
  }[];
  const upd = sqlite.prepare("UPDATE bets SET status = ?, profit = ?, settled_at = ? WHERE id = ?");
  const statusOf: Record<Outcome, string> = { win: "won", loss: "lost", push: "push", void: "void" };
  let n = 0;
  for (const b of open) {
    const r = settle(b.game_id, b.market, b.selection, b.line);
    if (r) {
      upd.run(statusOf[r], profitFor(r, b.stake, b.odds_decimal), Date.now(), b.id);
      n++;
    }
  }
  return n;
}
