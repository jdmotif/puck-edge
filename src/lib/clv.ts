// Closing-line value (CLV): how the price you took compares with the last price before puck drop.
// Closing lines are the sharpest number the market produces, so beating them on average is the
// quickest sign of a real edge (a few hundred bets, where win/loss needs thousands).
// Pure, so the static site can run it in the browser.
import type { MarketOdds } from "./odds";

/** Odds stored for a game (no source list). */
export type OddsSnapshot = Omit<MarketOdds, "sources">;

export interface ClosingPrice {
  odds: number; // best decimal price at the close
  prob: number; // margin-free market probability at the close
}

/** The closing price for one bet, or null when that market (or that line) wasn't priced at the close. */
export function closingPrice(
  snap: OddsSnapshot,
  teams: { home: string; away: string },
  market: string,
  selection: string,
  line: number | null,
): ClosingPrice | null {
  const side = <T,>(home: T, away: T) => (selection === teams.home ? home : selection === teams.away ? away : null);
  const out = (p: { best: number; fair: number } | null | undefined) => (p ? { odds: p.best, prob: p.fair } : null);
  if (market === "moneyline" && snap.moneyline) return out(side(snap.moneyline.home, snap.moneyline.away));
  if (market === "total" && snap.total && line === snap.total.line) {
    return out(selection === "over" ? snap.total.over : selection === "under" ? snap.total.under : null);
  }
  if (market === "puckline" && snap.puckline && line !== null) {
    const homeLine = snap.puckline.homeLine;
    if (selection === teams.home && line === homeLine) return out(snap.puckline.home);
    if (selection === teams.away && line === -homeLine) return out(snap.puckline.away);
  }
  return null;
}

/** Expected return per unit of the price taken, judged by the closing market's fair probability. */
export const clv = (takenOdds: number, closingProb: number) => takenOdds * closingProb - 1;

export interface ClvSummary {
  n: number;
  avg: number | null; // mean CLV per unit
  beat: number | null; // share of bets with positive CLV
}

export function summarizeClv(rows: { odds: number | null; closingProb: number | null }[]): ClvSummary {
  const v = rows.filter((r) => r.odds !== null && r.closingProb !== null).map((r) => clv(r.odds!, r.closingProb!));
  if (!v.length) return { n: 0, avg: null, beat: null };
  return { n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length, beat: v.filter((x) => x > 0).length / v.length };
}
