// Bankroll and ROI breakdowns over settled bets. Pure, so the static site can run it in the browser.
import type { BetRow } from "./bankroll-math";

export interface GroupStats {
  key: string;
  n: number;
  w: number;
  l: number;
  p: number; // pushes and voids
  staked: number;
  profit: number;
  roi: number | null;
}

export const settledBets = (bets: BetRow[]) =>
  bets.filter((b) => b.status !== "open").sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0) || a.id - b.id);

export function statsOf(bets: BetRow[], key = ""): GroupStats {
  const staked = bets.filter((b) => b.status !== "void").reduce((s, b) => s + b.stake, 0);
  const profit = bets.reduce((s, b) => s + (b.profit ?? 0), 0);
  return {
    key,
    n: bets.length,
    w: bets.filter((b) => b.status === "won").length,
    l: bets.filter((b) => b.status === "lost").length,
    p: bets.filter((b) => b.status === "push" || b.status === "void").length,
    staked,
    profit,
    roi: staked > 0 ? profit / staked : null,
  };
}

export function groupBy(bets: BetRow[], keyOf: (b: BetRow) => string): GroupStats[] {
  const groups = new Map<string, BetRow[]>();
  for (const b of bets) {
    const k = keyOf(b);
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  return [...groups.entries()].map(([k, list]) => statsOf(list, k));
}

/** Odds bands by decimal price: big favourite (−200 or shorter), favourite, underdog, long shot (+200 and up). */
export const oddsBand = (d: number) => (d <= 1.5 ? "fav" : d < 2 ? "slight" : d < 3 ? "dog" : "long");
export const ODDS_BANDS = ["fav", "slight", "dog", "long"];

/** Largest fall from a high point of the bankroll to a later low, in money. */
export function maxDrawdown(settled: BetRow[], start: number): number {
  let run = start;
  let peak = start;
  let worst = 0;
  for (const b of settled) {
    run += b.profit ?? 0;
    peak = Math.max(peak, run);
    worst = Math.max(worst, peak - run);
  }
  return worst;
}

/** Current run of wins or losses (pushes and voids skipped), most recent first. */
export function currentStreak(settled: BetRow[]): { won: boolean; n: number } | null {
  const decided = settled.filter((b) => b.status === "won" || b.status === "lost");
  const last = decided.at(-1);
  if (!last) return null;
  let n = 0;
  for (let i = decided.length - 1; i >= 0 && decided[i].status === last.status; i--) n++;
  return { won: last.status === "won", n };
}

/** Flat 1-unit results of graded picks (decimal odds). */
export function flatUnits(rows: { result: string; odds: number }[]) {
  const w = rows.filter((r) => r.result === "win").length;
  const l = rows.filter((r) => r.result === "loss").length;
  const units = rows.reduce((s, r) => s + (r.result === "win" ? r.odds - 1 : r.result === "loss" ? -1 : 0), 0);
  const decided = rows.filter((r) => r.result === "win" || r.result === "loss" || r.result === "push").length;
  return { n: rows.length, w, l, p: rows.length - w - l, units, roi: decided ? units / decided : null };
}
