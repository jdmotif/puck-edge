// Pure settlement rules, shared by the server (grading.ts) and the browser (bet tracker on the static site).

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

export interface GameResult {
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

export function profitFor(outcome: Outcome, stake: number, oddsDecimal: number): number {
  if (outcome === "win") return stake * (oddsDecimal - 1);
  if (outcome === "loss") return -stake;
  return 0;
}
