import { describe, expect, it } from "vitest";
import { scheduleMoneyline } from "./odds";
import fixture from "../../fixtures/schedule_2026-10-05.json";
import type { ScheduleResponse } from "./nhl/types";

const games = (fixture as unknown as ScheduleResponse).gameWeek[0].games;

describe("schedule moneyline", () => {
  it("combines the books into a margin-free price", () => {
    const ml = scheduleMoneyline(games[0])!; // PHI @ TBL, TBL ~ -220
    expect(ml.home.fair + ml.away.fair).toBeCloseTo(1, 10);
    expect(ml.home.fair).toBeGreaterThan(0.6);
    expect(ml.home.fair).toBeLessThan(0.72);
    expect(ml.home.books).toBeGreaterThanOrEqual(3);
  });

  it("drops 3-way and outlier prices", () => {
    // provider 10 quotes 3.95 / 1.77 (a 3-way regulation price, ~82% book) — must be ignored
    const ml = scheduleMoneyline(games[0])!;
    expect(ml.away.best).toBeLessThan(3.5);
  });

  it("returns undefined without odds", () => {
    const g = { ...games[0], homeTeam: { ...games[0].homeTeam, odds: [] } };
    expect(scheduleMoneyline(g)).toBeUndefined();
  });
});
