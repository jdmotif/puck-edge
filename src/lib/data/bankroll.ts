import { sqlite } from "@/db";
import { getSettings } from "@/lib/settings";

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

export function listBets(): BetRow[] {
  return sqlite
    .prepare(
      `SELECT id, created_at AS createdAt, game_id AS gameId, game_date AS gameDate, game_label AS gameLabel, market, selection,
        selection_label AS selectionLabel, line, odds_decimal AS oddsDecimal, stake, status, profit, settled_at AS settledAt, notes
       FROM bets ORDER BY game_date DESC, id DESC`,
    )
    .all() as BetRow[];
}

export function bankrollNow(): number {
  const s = getSettings();
  const r = sqlite.prepare("SELECT COALESCE(SUM(profit), 0) AS p FROM bets WHERE status != 'open'").get() as { p: number };
  return s.startingBankroll + r.p;
}

/** Realised P&L for bets settled since a time (ms). */
export function pnlSince(ms: number): number {
  const r = sqlite.prepare("SELECT COALESCE(SUM(profit), 0) AS p FROM bets WHERE status != 'open' AND settled_at >= ?").get(ms) as { p: number };
  return r.p;
}

export function lossLimitStatus() {
  const s = getSettings();
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = dayStart - ((now.getDay() + 6) % 7) * 86_400_000; // Monday
  const day = pnlSince(dayStart);
  const week = pnlSince(weekStart);
  const warnings: string[] = [];
  if (s.dailyLossLimit > 0 && -day >= s.dailyLossLimit * 0.8)
    warnings.push(-day >= s.dailyLossLimit ? `You've hit your daily loss limit ($${s.dailyLossLimit}). Consider stopping for today.` : `You're within 20% of your daily loss limit ($${s.dailyLossLimit}).`);
  if (s.weeklyLossLimit > 0 && -week >= s.weeklyLossLimit * 0.8)
    warnings.push(-week >= s.weeklyLossLimit ? `You've hit your weekly loss limit ($${s.weeklyLossLimit}).` : `You're within 20% of your weekly loss limit ($${s.weeklyLossLimit}).`);
  return { day, week, warnings };
}
