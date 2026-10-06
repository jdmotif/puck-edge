import { describe, expect, it } from "vitest";
import { sqlite } from "@/db";
import { changeReasons, logPicks, type GameCard, type Pick, type PickContext, type Slate } from "./picks";
import type { Market } from "./grading";

const ctx = (homeGoalie: number, prices = "[0.55]"): PickContext => ({
  goalies: { home: { id: homeGoalie, name: homeGoalie === 1 ? "Joseph Woll" : "Anthony Stolarz" }, away: { id: 9, name: "Juuse Saros" } },
  lineups: { home: "game-day", away: "game-day" },
  prices,
});

const pick = (market: Market, selection: string, edge: number, line: number | null = null): Pick => ({
  market,
  selection,
  label: `${selection} ${market}`,
  logLabel: `${selection} ${market}`,
  line,
  modelProb: 0.55,
  marketProb: 0.5,
  odds: 1.95,
  book: "Book",
  edge,
  ev: edge,
  isValue: edge >= 0.03,
  confidence: "Medium",
  reasons: [],
  stake: null,
});

function slate(picks: Pick[], best: Pick, context: PickContext): Slate {
  const card = {
    game: { id: 2026020044, gameType: 2, gameState: "FUT", startTimeUTC: "2099-10-06T23:00:00Z" },
    home: { abbrev: "TOR" },
    away: { abbrev: "NSH" },
    picks,
    best,
    propPicks: [],
    locked: false,
    context,
    changes: [],
  } as unknown as GameCard;
  return { date: "2099-10-06", cards: [card], sources: [], oddsNote: "", modelFitted: false, modelGames: 0, hasHistory: true };
}

describe("why a pick changed", () => {
  it("names the new goalie, then moved odds, otherwise the model", () => {
    expect(changeReasons(ctx(1), ctx(2), { home: "TOR", away: "NSH" })).toEqual([{ kind: "goalie", team: "TOR", name: "Anthony Stolarz" }]);
    expect(changeReasons(ctx(1), ctx(2, "[0.6]"), { home: "TOR", away: "NSH" })).toEqual([
      { kind: "goalie", team: "TOR", name: "Anthony Stolarz" },
      { kind: "odds" },
    ]);
    expect(changeReasons(ctx(1), ctx(1), { home: "TOR", away: "NSH" })).toEqual([{ kind: "model" }]);
    expect(changeReasons(null, ctx(1), { home: "TOR", away: "NSH" })).toEqual([]);
  });
});

describe("logging picks through the day", () => {
  it("keeps only the latest pre-game version for grading and records what changed", () => {
    const ml = pick("moneyline", "TOR", 0.04);
    const total = pick("total", "over", 0.01, 6.5);
    const first = slate([ml, total], ml, ctx(1));
    logPicks(first);
    expect(first.cards[0].changes).toEqual([]);

    // Later: Stolarz is now expected in the Leafs' net, the moneyline flips and the Best Pick moves to the total.
    const ml2 = pick("moneyline", "NSH", 0.02);
    const total2 = pick("total", "over", 0.035, 6.5);
    const second = slate([ml2, total2], total2, ctx(2));
    logPicks(second);

    const rows = sqlite.prepare("SELECT market, selection, is_best AS best FROM picks WHERE game_id = 2026020044 ORDER BY market").all();
    expect(rows).toEqual([
      { market: "moneyline", selection: "NSH", best: 0 },
      { market: "total", selection: "over", best: 1 },
    ]);
    const changes = second.cards[0].changes;
    expect(changes.map((c) => [c.market, c.from.label, c.to.label])).toEqual([
      ["best", "TOR moneyline", "over total"],
      ["moneyline", "TOR moneyline", "NSH moneyline"],
    ]);
    expect(changes[0].reasons).toEqual([{ kind: "goalie", team: "TOR", name: "Anthony Stolarz" }]);

    // Nothing new: no extra change rows.
    logPicks(slate([ml2, total2], total2, ctx(2)));
    expect((sqlite.prepare("SELECT COUNT(*) AS n FROM pick_changes").get() as { n: number }).n).toBe(2);
  });
});
