import { describe, expect, it } from "vitest";
import { sqlite } from "@/db";
import { bestOf, changeReasons, logPicks, priced, type GameCard, type Pick, type PickContext, type Slate } from "./picks";
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
  blendProb: 0.51,
  blendWeight: 0.2,
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

function slate(picks: Pick[], best: Pick | null, context: PickContext, id = 2026020044): Slate {
  const card = {
    game: { id, gameType: 2, gameState: "FUT", startTimeUTC: "2099-10-06T23:00:00Z" },
    home: { abbrev: "TOR" },
    away: { abbrev: "NSH" },
    picks,
    best,
    propPicks: [],
    locked: false,
    context,
    changes: [],
  } as unknown as GameCard;
  return { date: "2099-10-06", cards: [card], sources: [], oddsNote: "", modelFitted: false, modelGames: 0, hasHistory: true, blend: { w: 0.2, fitted: false, n: 0 } };
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

describe("market-anchored pricing", () => {
  const settings = { kellyFraction: 0.25, maxStakePct: 0.03 };
  it("measures edge, EV and stake from the blend, not the raw model", () => {
    // Book: Boston 70% fair, model 55%. Blended at 0.2: 67%, so the edge is −3 points, not −15.
    const p = priced(0.55, { fair: 0.7, best: 1.45, bestBook: "Book", books: 3 }, 0.2, settings, 1000);
    expect(p.blendProb).toBeCloseTo(0.67);
    expect(p.edge).toBeCloseTo(-0.03);
    expect(p.ev).toBeCloseTo(0.67 * 0.45 - 0.33);
    expect(p.stake).toBe(0);
  });

  it("makes no Best Pick when nothing has a positive expected value", () => {
    const noValue = { ...pick("moneyline", "TOR", 0.01), ev: -0.02 };
    const pl = { ...pick("puckline", "NSH", 0.005, 1.5), ev: -0.03 };
    expect(bestOf([noValue, pl])).toBeNull();
    expect(bestOf([])).toBeNull();
    const plus = { ...pl, ev: 0.01 };
    expect(bestOf([noValue, plus])).toBe(plus);
    const value = pick("moneyline", "TOR", 0.04);
    expect(bestOf([plus, value])).toBe(value);
  });
});

describe("the price a pick is measured from", () => {
  const id = 2026020045;
  const row = () =>
    sqlite.prepare("SELECT selection, odds_decimal AS odds, first_odds AS firstOdds, blend_prob AS bp FROM picks WHERE game_id = ? AND market = 'moneyline'").get(id);

  it("keeps the price from when the selection first appeared, and resets it when the pick switches", () => {
    const first = { ...pick("moneyline", "NSH", 0.02), odds: 2.3 };
    logPicks(slate([first], first, ctx(2), id));
    const later = { ...pick("moneyline", "NSH", 0.02), odds: 2.1 };
    logPicks(slate([later], later, ctx(2), id));
    expect(row()).toEqual({ selection: "NSH", odds: 2.1, firstOdds: 2.3, bp: 0.51 });
    const flipped = { ...pick("moneyline", "TOR", 0.02), odds: 1.8 };
    logPicks(slate([flipped], flipped, ctx(2), id));
    expect(row()).toEqual({ selection: "TOR", odds: 1.8, firstOdds: 1.8, bp: 0.51 });
  });

  it("keeps a logged pick whose market lost its price before puck drop, and drops paused totals", () => {
    sqlite
      .prepare(
        `INSERT INTO picks (game_id, game_date, start_utc, market, selection, selection_label, line, model_prob, confidence, reasons, created_at, updated_at)
         VALUES (?, '2099-10-06', '2099-10-06T23:00:00Z', 'total', 'over', 'Over 6.5', 6.5, 0.5, 'Low', '[]', 1, 1)`,
      )
      .run(id);
    logPicks(slate([], null, ctx(2), id));
    expect(sqlite.prepare("SELECT market, is_best AS best FROM picks WHERE game_id = ? AND result IS NULL ORDER BY market").all(id)).toEqual([
      { market: "moneyline", best: 0 },
    ]);
  });
});
