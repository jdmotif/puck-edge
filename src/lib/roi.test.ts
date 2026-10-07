import { describe, expect, it } from "vitest";
import type { BetRow } from "./bankroll-math";
import { currentStreak, flatUnits, groupBy, maxDrawdown, oddsBand, settledBets, statsOf } from "./roi";

const bet = (id: number, status: string, stake: number, odds: number, extra: Partial<BetRow> = {}): BetRow => ({
  id, createdAt: id, gameId: id, gameDate: "2026-10-0" + id, gameLabel: "A @ B", market: "moneyline", selection: "B", selectionLabel: "B",
  line: null, oddsDecimal: odds, stake, status, settledAt: status === "open" ? null : id,
  profit: status === "won" ? stake * (odds - 1) : status === "lost" ? -stake : status === "open" ? null : 0, notes: null, ...extra,
});

describe("roi", () => {
  const bets = [bet(1, "won", 10, 2), bet(2, "lost", 10, 1.8), bet(3, "lost", 20, 2.5), bet(4, "push", 10, 1.9), bet(5, "open", 10, 2)];
  const settled = settledBets(bets);

  it("totals staked, profit and ROI over settled bets", () => {
    const s = statsOf(settled);
    expect(s).toMatchObject({ n: 4, w: 1, l: 2, p: 1, staked: 50, profit: -20 });
    expect(s.roi).toBeCloseTo(-0.4);
  });

  it("groups by a key", () => {
    const g = groupBy(settled, (b) => oddsBand(b.oddsDecimal));
    expect(g.find((x) => x.key === "dog")).toMatchObject({ n: 2, profit: -10 });
    expect(g.find((x) => x.key === "slight")).toMatchObject({ n: 2, profit: -10 });
  });

  it("finds the biggest drop and the current streak", () => {
    expect(maxDrawdown(settled, 100)).toBe(30);
    expect(currentStreak(settled)).toEqual({ won: false, n: 2 });
  });

  it("bands odds at −200, evens and +200", () => {
    expect([1.5, 1.51, 2, 2.99, 3].map(oddsBand)).toEqual(["fav", "slight", "dog", "dog", "long"]);
  });

  it("counts flat units", () => {
    const r = flatUnits([{ result: "win", odds: 2.1 }, { result: "loss", odds: 1.9 }, { result: "push", odds: 2 }]);
    expect(r).toMatchObject({ n: 3, w: 1, l: 1, p: 1 });
    expect(r.units).toBeCloseTo(0.1);
  });
});
