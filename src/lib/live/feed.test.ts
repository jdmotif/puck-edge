import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import type { ScoreGame, ScoreResponse } from "@/lib/nhl/types";
import { feedFile, feedOf, liveStatus, type LiveGame } from "./feed";

const en = i18n("en").t;
const fr = i18n("fr").t;

const game = (over: Partial<LiveGame>): LiveGame => ({
  id: 1, state: "LIVE", away: 2, home: 1, period: 2, periodType: "REG", clock: "12:34", intermission: false, lastPeriodType: null, ...over,
});

describe("live feed", () => {
  it("names files by UTC minute", () => {
    expect(feedFile(new Date("2026-10-07T01:31:59.900Z"))).toBe("202610070131.json");
  });

  it("writes the same status line as the game cards", () => {
    expect(liveStatus(game({}), en.status)).toBe("P2 12:34");
    expect(liveStatus(game({ intermission: true }), en.status)).toBe("P2 INT");
    expect(liveStatus(game({ state: "OFF", lastPeriodType: "OT" }), en.status)).toBe("Final/OT");
    expect(liveStatus(game({ period: 4, periodType: "OT", clock: "03:00" }), fr.status)).toBe(`${fr.status.period(4, "OT")} 03:00`);
  });

  it("keeps scores, period and clock from the scoreboard", () => {
    const g = {
      id: 7, gameState: "CRIT", awayTeam: { score: 4 }, homeTeam: { score: 4 },
      periodDescriptor: { number: 3, periodType: "REG" }, clock: { timeRemaining: "03:15", inIntermission: false },
    } as unknown as ScoreGame;
    const feed = feedOf([{ games: [g] } as unknown as ScoreResponse, null], new Date("2026-10-07T01:33:00Z"));
    expect(feed).toEqual({
      at: "2026-10-07T01:33:00.000Z",
      games: [{ id: 7, state: "CRIT", away: 4, home: 4, period: 3, periodType: "REG", clock: "03:15", intermission: false, lastPeriodType: null }],
    });
  });
});
