import { sqlite } from "@/db";
import { getSettings } from "@/lib/settings";
import { bankrollOf, lossLimits, type BetRow } from "@/lib/bankroll-math";

export type { BetRow };

export function listBets(): BetRow[] {
  // node:sqlite rows have a null prototype; copy them so they can be passed to client components.
  return (sqlite
    .prepare(
      `SELECT id, created_at AS createdAt, game_id AS gameId, game_date AS gameDate, game_label AS gameLabel, market, selection,
        selection_label AS selectionLabel, line, odds_decimal AS oddsDecimal, stake, status, profit, settled_at AS settledAt, notes,
        closing_odds AS closingOdds, closing_prob AS closingProb
       FROM bets ORDER BY game_date DESC, id DESC`,
    )
    .all() as BetRow[]).map((r) => ({ ...r }));
}

export const bankrollNow = (): number => bankrollOf(listBets(), getSettings());

export const lossLimitStatus = () => lossLimits(listBets(), getSettings());
