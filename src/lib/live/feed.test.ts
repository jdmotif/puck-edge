import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import type { ScoreGame, ScoreResponse } from "@/lib/nhl/types";
import type { BoxscoreResponse, GameLandingResponse } from "@/lib/nhl/types";
import { boxFile, boxOf, feedFile, feedOf, goalsOfLanding, liveStatus, scoringPeriods, type LiveGame, type LiveGoal } from "./feed";

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
      games: [{ id: 7, state: "CRIT", away: 4, home: 4, period: 3, periodType: "REG", clock: "03:15", intermission: false, lastPeriodType: null, goals: [] }],
    });
  });

  it("keeps who scored and assisted from the scoreboard", () => {
    const g = {
      id: 7, gameState: "LIVE", awayTeam: { score: 1 }, homeTeam: { score: 0 },
      goals: [{
        period: 1, periodDescriptor: { number: 1, periodType: "REG" }, timeInPeriod: "07:13", playerId: 11, name: { default: "S. Stamkos" },
        teamAbbrev: "NSH", goalsToDate: 2, awayScore: 1, homeScore: 0, strength: "pp",
        assists: [{ playerId: 12, name: { default: "R. Josi" }, assistsToDate: 2 }],
      }],
    } as unknown as ScoreGame;
    expect(feedOf([{ games: [g] } as unknown as ScoreResponse]).games[0].goals).toEqual([{
      period: 1, periodType: "REG", time: "07:13", team: "NSH", playerId: 11, name: "S. Stamkos", goalsToDate: 2,
      assists: [{ playerId: 12, name: "R. Josi", assistsToDate: 2 }], strength: "pp", away: 1, home: 0,
    }]);
  });

  it("reads goals from a game's landing summary in the same shape", () => {
    const l = {
      summary: { scoring: [{ periodDescriptor: { number: 2, periodType: "REG" }, goals: [{
        timeInPeriod: "01:02", teamAbbrev: { default: "TOR" }, playerId: 34, name: { default: "A. Matthews" }, goalsToDate: 3,
        assists: [], strength: "ev", awayScore: 0, homeScore: 1,
      }] }] },
    } as unknown as GameLandingResponse;
    expect(goalsOfLanding(l)).toEqual([{ period: 2, periodType: "REG", time: "01:02", team: "TOR", playerId: 34, name: "A. Matthews", goalsToDate: 3, assists: [], strength: "ev", away: 0, home: 1 }]);
  });

  it("keeps each team's skaters and the goalies who played", () => {
    const sk = (id: number, goals: number) => ({ playerId: id, name: { default: `P${id}` }, position: "C", goals, assists: 1, points: goals + 1, sog: 3, plusMinus: 1, hits: 2, toi: "15:00", pim: 0 });
    const gk = (id: number, toi: string) => ({ playerId: id, name: { default: `G${id}` }, shotsAgainst: 20, saves: 18, savePctg: 0.9, toi, starter: toi !== "00:00" });
    const b = {
      id: 7, awayTeam: { abbrev: "NSH", sog: 25 }, homeTeam: { abbrev: "TOR", sog: 20 },
      playerByGameStats: {
        awayTeam: { forwards: [sk(1, 2)], defense: [sk(2, 0)], goalies: [gk(3, "40:00"), gk(4, "00:00")] },
        homeTeam: { forwards: [], defense: [], goalies: [] },
      },
    } as unknown as BoxscoreResponse;
    const box = boxOf(b, new Date("2026-10-07T01:33:00Z"))!;
    expect(box.away.skaters.map((s) => [s.playerId, s.goals, s.points])).toEqual([[1, 2, 3], [2, 0, 1]]);
    expect(box.away.goalies).toEqual([{ playerId: 3, name: "G3", shotsAgainst: 20, saves: 18, savePctg: 0.9, toi: "40:00", starter: true, decision: null }]);
    expect(box.home.sog).toBe(20);
    expect(boxOf({ ...b, playerByGameStats: undefined })).toBeNull();
  });

  it("names box files after their minute", () => {
    expect(boxFile("202610070131.json", 2026020044)).toBe("202610070131-2026020044.json");
  });

  it("lists every period played so far on the scoring sheet", () => {
    const goal = (period: number, periodType = "REG") => ({ period, periodType }) as LiveGoal;
    expect(scoringPeriods([], { period: 2, periodType: "REG" })).toEqual([{ period: 1, periodType: "REG" }, { period: 2, periodType: "REG" }]);
    expect(scoringPeriods([goal(4, "OT")], { period: 4, periodType: "OT" }).map((p) => p.periodType)).toEqual(["REG", "REG", "REG", "OT"]);
    expect(scoringPeriods([goal(1)], { period: null, periodType: null })).toEqual([{ period: 1, periodType: "REG" }]);
  });
});
