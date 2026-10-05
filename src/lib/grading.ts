// Grades model picks and settles the user's bets against stored final scores.
import { sqlite } from "@/db";

export type Market = "moneyline" | "total" | "puckline" | "prop_goal" | "prop_point1" | "prop_point2";
export type Outcome = "win" | "loss" | "push" | "void";

export const MARKET_LABELS: Record<Market, string> = {
  moneyline: "Moneyline",
  total: "Total goals",
  puckline: "Puck line",
  prop_goal: "Anytime goal",
  prop_point1: "1+ points",
  prop_point2: "2+ points",
};

interface GameResult {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

/**
 * Settle one selection against a final score. Final scores include the shootout winner's goal,
 * which is how books settle totals and puck lines.
 * - moneyline: selection = team abbrev
 * - total: selection = "over" | "under", line = e.g. 6.5
 * - puckline: selection = team abbrev, line = that team's spread (−1.5 or +1.5)
 * - props: selection = player id
 */
export function outcomeFor(
  market: Market,
  selection: string,
  line: number | null,
  game: GameResult,
  player?: { goals: number; points: number } | null,
): Outcome {
  if (market === "moneyline") {
    const winner = game.homeScore > game.awayScore ? game.home : game.away;
    return selection === winner ? "win" : "loss";
  }
  if (market === "total") {
    if (line === null) return "void";
    const total = game.homeScore + game.awayScore;
    if (total === line) return "push";
    const over = total > line;
    return (selection === "over") === over ? "win" : "loss";
  }
  if (market === "puckline") {
    if (line === null) return "void";
    const margin = selection === game.home ? game.homeScore - game.awayScore : game.awayScore - game.homeScore;
    const adj = margin + line;
    if (adj === 0) return "push";
    return adj > 0 ? "win" : "loss";
  }
  // Props: a player who didn't dress is void.
  if (!player) return "void";
  if (market === "prop_goal") return player.goals >= 1 ? "win" : "loss";
  if (market === "prop_point1") return player.points >= 1 ? "win" : "loss";
  if (market === "prop_point2") return player.points >= 2 ? "win" : "loss";
  return "void";
}

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

export function profitFor(outcome: Outcome, stake: number, oddsDecimal: number): number {
  if (outcome === "win") return stake * (oddsDecimal - 1);
  if (outcome === "loss") return -stake;
  return 0;
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
