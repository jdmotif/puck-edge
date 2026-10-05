import { describe, expect, it } from "vitest";
import { buildLines, isDressedList, officialLineup, projectLineup, type HistoryGame, type LineupPlayer, type RosterEntry } from "./lineups";
import boxFixture from "../../fixtures/gamecenter_2026020035_boxscore.json";
import type { BoxscoreResponse } from "./nhl/types";

const p = (id: number, pos: string, toiMin: number): LineupPlayer => ({ id, name: `P${id}`, pos, toiSec: toiMin * 60, gp: 5 });

describe("buildLines", () => {
  it("anchors lines on the top-4 centres and pairs wingers by ice time", () => {
    const fwds = [
      p(1, "C", 20), p(2, "C", 17), p(3, "C", 15), p(4, "C", 12),
      p(5, "R", 19), p(6, "L", 18.5), p(7, "L", 16), p(8, "R", 15.5),
      p(9, "L", 14), p(10, "R", 13), p(11, "R", 11), p(12, "L", 10),
    ];
    const lines = buildLines(fwds);
    expect(lines.map((l) => l.map((x) => x.id))).toEqual([
      [6, 1, 5], // L on the left, R on the right
      [7, 2, 8],
      [9, 3, 10],
      [12, 4, 11],
    ]);
  });

  it("fills the centre slot from the top forwards when fewer than four centres dress", () => {
    const fwds = [p(1, "C", 20), p(2, "C", 18), p(3, "C", 16), ...Array.from({ length: 9 }, (_, i) => p(10 + i, i % 2 ? "R" : "L", 19 - i))];
    const lines = buildLines(fwds);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.length === 3)).toBe(true);
  });
});

function history(n: number, opts: { goalieStarts: number[]; first: string }): HistoryGame[] {
  // n games, newest first, one day apart starting the day before `first`
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(opts.first + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1 - i);
    const skaters = [
      ...Array.from({ length: 12 }, (_, k) => ({ id: 100 + k, name: `F${k}`, pos: k < 4 ? "C" : k % 2 ? "L" : "R", toiSec: (20 - k) * 60, starter: null })),
      ...Array.from({ length: 6 }, (_, k) => ({ id: 200 + k, name: `D${k}`, pos: "D", toiSec: (24 - k) * 60, starter: null })),
    ];
    const g = opts.goalieStarts[i] ?? 1;
    return { gameId: i, date: d.toISOString().slice(0, 10), players: [...skaters, { id: g, name: `G${g}`, pos: "G", toiSec: 3600, starter: true }] };
  });
}

const roster: RosterEntry[] = [
  ...Array.from({ length: 12 }, (_, k) => ({ id: 100 + k, name: `F${k}`, pos: k < 4 ? "C" : k % 2 ? "L" : "R" })),
  ...Array.from({ length: 6 }, (_, k) => ({ id: 200 + k, name: `D${k}`, pos: "D" })),
  { id: 113, name: "Callup", pos: "C" },
  { id: 1, name: "G1", pos: "G" },
  { id: 2, name: "G2", pos: "G" },
];

describe("projectLineup", () => {
  it("dresses recent regulars and leaves new call-ups as extras", () => {
    const t = projectLineup({ team: "X", gameDate: "2026-10-10", roster, history: history(5, { goalieStarts: [1, 1, 2, 1, 1], first: "2026-10-08" }), rosterSource: "game-day" });
    expect(t.forwards.flat()).toHaveLength(12);
    expect(t.defense.flat()).toHaveLength(6);
    expect(t.extras.map((x) => x.id)).toEqual([113]);
    expect(t.goalie?.id).toBe(1);
    expect(t.goalieNote).toBe("4 of the last 5 starts");
  });

  it("drops players who are no longer on the active roster", () => {
    const short = roster.filter((r) => r.id !== 100);
    const t = projectLineup({ team: "X", gameDate: "2026-10-10", roster: short, history: history(5, { goalieStarts: [1], first: "2026-10-08" }), rosterSource: "game-day" });
    expect(t.forwards.flat().map((x) => x.id)).not.toContain(100);
    expect(t.forwards.flat().map((x) => x.id)).toContain(113);
  });

  it("projects the backup when the starter played yesterday", () => {
    const t = projectLineup({ team: "X", gameDate: "2026-10-10", roster, history: history(5, { goalieStarts: [1, 1, 1, 2, 1], first: "2026-10-10" }), rosterSource: "game-day" });
    expect(t.goalie?.id).toBe(2);
    expect(t.backup?.id).toBe(1);
    expect(t.goalieNote).toMatch(/Back-to-back/);
  });
});

describe("officialLineup", () => {
  it("uses the dressed players and the box score starter", () => {
    const box = boxFixture as unknown as BoxscoreResponse;
    const t = officialLineup({ team: box.homeTeam.abbrev, stats: box.playerByGameStats!.homeTeam, history: [], final: true });
    expect(t.status).toBe("official");
    expect(t.forwards.flat()).toHaveLength(box.playerByGameStats!.homeTeam.forwards.length);
    expect(t.defense.flat()).toHaveLength(box.playerByGameStats!.homeTeam.defense.length);
    expect(t.goalie?.id).toBe(box.playerByGameStats!.homeTeam.goalies.find((g) => g.starter)!.playerId);
  });
});

describe("isDressedList", () => {
  it("tells the 20 dressed apart from the 23-man active roster", () => {
    const skaters = (n: number): RosterEntry[] => Array.from({ length: n }, (_, i) => ({ id: i, name: `S${i}`, pos: i < 6 ? "D" : "C" }));
    const goalies: RosterEntry[] = [{ id: 90, name: "G1", pos: "G" }, { id: 91, name: "G2", pos: "G" }];
    expect(isDressedList([...skaters(18), ...goalies])).toBe(true);
    expect(isDressedList([...skaters(21), ...goalies])).toBe(false);
    expect(isDressedList([])).toBe(false);
  });
});

describe("projectLineup with the posted dressed list", () => {
  it("keeps an 11 F / 7 D lineup intact", () => {
    const dressed = roster.filter((r) => r.id !== 111 && r.id !== 113).concat({ id: 206, name: "D6", pos: "D" });
    const t = projectLineup({ team: "X", gameDate: "2026-10-10", roster: dressed, history: history(5, { goalieStarts: [1], first: "2026-10-08" }), rosterSource: "dressed-pregame" });
    expect(t.forwards.flat()).toHaveLength(11);
    expect(t.defense.flat()).toHaveLength(7);
    expect(t.extras).toHaveLength(0);
  });
});

describe("officialLineup while live", () => {
  it("takes the goalie with ice time when the starter flag isn't set yet", () => {
    const box = boxFixture as unknown as BoxscoreResponse;
    const stats = box.playerByGameStats!.homeTeam;
    const played = stats.goalies.find((g) => g.starter)!;
    const live = { ...stats, goalies: [...stats.goalies].reverse().map((g) => ({ ...g, starter: null as unknown as boolean })) };
    const t = officialLineup({ team: box.homeTeam.abbrev, stats: live, history: [], final: false });
    expect(t.goalie?.id).toBe(played.playerId);
  });
});
