// Bankroll and loss-limit maths over a list of bets. Pure, so the static site can run it in the browser.
import type { Settings } from "./settings-shared";

export interface BetRow {
  id: number;
  createdAt: number;
  gameId: number;
  gameDate: string;
  gameLabel: string;
  market: string;
  selection: string;
  selectionLabel: string;
  line: number | null;
  oddsDecimal: number;
  stake: number;
  status: string;
  profit: number | null;
  settledAt: number | null;
  notes: string | null;
}

export type LossWarning = { key: "dayHit" | "dayNear" | "weekHit" | "weekNear"; limit: number };

export const bankrollOf = (bets: BetRow[], s: Settings) =>
  s.startingBankroll + bets.filter((b) => b.status !== "open").reduce((sum, b) => sum + (b.profit ?? 0), 0);

/** Realised P&L today and this week (from Monday), and the loss-limit warnings they trigger. */
export function lossLimits(bets: BetRow[], s: Settings, now = new Date()) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = dayStart - ((now.getDay() + 6) % 7) * 86_400_000; // Monday
  const since = (ms: number) => bets.filter((b) => b.status !== "open" && (b.settledAt ?? 0) >= ms).reduce((sum, b) => sum + (b.profit ?? 0), 0);
  const day = since(dayStart);
  const week = since(weekStart);
  // Message keys (see `limits` in the i18n dictionaries) with the limit they refer to.
  const warnings: LossWarning[] = [];
  if (s.dailyLossLimit > 0 && -day >= s.dailyLossLimit * 0.8) warnings.push({ key: -day >= s.dailyLossLimit ? "dayHit" : "dayNear", limit: s.dailyLossLimit });
  if (s.weeklyLossLimit > 0 && -week >= s.weeklyLossLimit * 0.8) warnings.push({ key: -week >= s.weeklyLossLimit ? "weekHit" : "weekNear", limit: s.weeklyLossLimit });
  return { day, week, warnings };
}
