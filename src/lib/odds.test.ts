import { describe, expect, it } from "vitest";
import { partnerMarkets, scheduleMoneyline } from "./odds";
import fixture from "../../fixtures/schedule_2026-10-05.json";
import partnerCA from "../../fixtures/partner-game_CA_now.json";
import scoreFixture from "../../fixtures/score_2026-10-04.json";
import type { PartnerGameResponse, ScheduleResponse, ScoreResponse } from "./nhl/types";

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

describe("country books", () => {
  it("takes the best price only from the user's country when it has one", () => {
    const partners = (scoreFixture as unknown as ScoreResponse).oddsPartners ?? [];
    const all = scheduleMoneyline(games[0], partners)!;
    const ca = scheduleMoneyline(games[0], partners, "CA")!;
    expect(ca.away.bestBook).toBe("FanDuel");
    expect(ca.away.fair).toBeCloseTo(all.away.fair, 10); // consensus still uses every book
    expect(ca.away.best).toBeLessThanOrEqual(all.away.best);
  });
});

describe("partner-game markets", () => {
  const pg = (partnerCA as unknown as PartnerGameResponse).games.find((g) => g.gameId === 2026020040)!;

  it("reads the total and puck line (PHI @ TBL: O/U 5.5, TBL -1.5)", () => {
    const m = partnerMarkets(pg, "FanDuel");
    expect(m.total?.line).toBe(5.5);
    expect(m.total!.over.fair + m.total!.under.fair).toBeCloseTo(1, 10);
    expect(m.total!.over.best).toBeCloseTo(1 + 100 / 124, 5);
    expect(m.puckline?.homeLine).toBe(-1.5);
    expect(m.puckline!.home.best).toBeCloseTo(2.14, 5);
    expect(m.puckline!.away.bestBook).toBe("FanDuel");
  });

  it("skips markets that aren't there", () => {
    const bare = { ...pg, homeTeam: { ...pg.homeTeam, odds: [] }, awayTeam: { ...pg.awayTeam, odds: [] } };
    expect(partnerMarkets(bare, "FanDuel")).toEqual({});
  });
});
