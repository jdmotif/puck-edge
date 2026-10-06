import { describe, expect, it } from "vitest";
import { sqlite } from "@/db";
import { closingPrice, clv, summarizeClv, type OddsSnapshot } from "./clv";
import { fillClosing, loadSnapshot, saveSnapshot } from "./data/closing";
import { blend, fitBlendWeight } from "./model/blend";

const side = (fair: number, best: number) => ({ fair, best, bestBook: "Book", books: 1 });
const snap: OddsSnapshot = {
  moneyline: { home: side(0.6, 1.62), away: side(0.4, 2.4) },
  total: { line: 6.5, over: side(0.48, 2.0), under: side(0.52, 1.8) },
  puckline: { homeLine: -1.5, home: side(0.35, 2.7), away: side(0.65, 1.48) },
};
const teams = { home: "TOR", away: "NSH" };

describe("closing price", () => {
  it("finds the closing price for each market and side", () => {
    expect(closingPrice(snap, teams, "moneyline", "NSH", null)).toEqual({ odds: 2.4, prob: 0.4 });
    expect(closingPrice(snap, teams, "total", "under", 6.5)).toEqual({ odds: 1.8, prob: 0.52 });
    expect(closingPrice(snap, teams, "puckline", "TOR", -1.5)).toEqual({ odds: 2.7, prob: 0.35 });
    expect(closingPrice(snap, teams, "puckline", "NSH", 1.5)).toEqual({ odds: 1.48, prob: 0.65 });
  });

  it("has no closing price when the line moved or the market wasn't priced", () => {
    expect(closingPrice(snap, teams, "total", "over", 5.5)).toBeNull();
    expect(closingPrice(snap, teams, "puckline", "NSH", -1.5)).toBeNull();
    expect(closingPrice({}, teams, "moneyline", "TOR", null)).toBeNull();
    expect(closingPrice(snap, teams, "prop_goal", "8478402", null)).toBeNull();
  });

  it("measures CLV against the closing fair probability", () => {
    // Took NSH at +150 (2.5); it closed at a fair 40%: 2.5 × 0.4 − 1 = 0 (no better than fair).
    expect(clv(2.5, 0.4)).toBeCloseTo(0);
    expect(clv(2.6, 0.4)).toBeCloseTo(0.04);
    expect(summarizeClv([{ odds: 2.6, closingProb: 0.4 }, { odds: 2.3, closingProb: 0.4 }, { odds: null, closingProb: 0.5 }])).toEqual({
      n: 2,
      avg: expect.closeTo(-0.02, 6),
      beat: 0.5,
    });
    expect(summarizeClv([])).toEqual({ n: 0, avg: null, beat: null });
  });
});

describe("closing lines in the database", () => {
  const game = { id: 2026020101, startTimeUTC: "2026-10-06T23:00:00Z", homeTeam: { abbrev: "TOR" }, awayTeam: { abbrev: "NSH" } };

  it("keeps the last pre-game price of each market and copies it onto picks and bets once the game starts", () => {
    saveSnapshot(game, { ...snap, sources: [] }, 1);
    // A later read without the puck line keeps the earlier puck line and updates the moneyline.
    saveSnapshot(game, { moneyline: { home: side(0.62, 1.58), away: side(0.38, 2.5) }, sources: [] }, 2);
    const s = loadSnapshot(game.id)!;
    expect(s.moneyline!.away.best).toBe(2.5);
    expect(s.puckline!.homeLine).toBe(-1.5);

    sqlite
      .prepare(
        `INSERT INTO picks (game_id, game_date, start_utc, market, selection, selection_label, line, model_prob, confidence, reasons, created_at, updated_at, first_odds)
         VALUES (?, '2026-10-06', ?, 'moneyline', 'NSH', 'NSH moneyline', NULL, 0.45, 'Low', '[]', 1, 1, 2.6)`,
      )
      .run(game.id, game.startTimeUTC);
    sqlite
      .prepare(
        `INSERT INTO bets (created_at, game_id, game_date, game_label, market, selection, selection_label, line, odds_decimal, stake)
         VALUES (1, ?, '2026-10-06', 'NSH @ TOR', 'puckline', 'NSH', 'NSH +1.5', 1.5, 1.5, 10)`,
      )
      .run(game.id);

    expect(fillClosing(Date.parse("2026-10-06T22:00:00Z"))).toBe(0); // not started yet
    expect(fillClosing(Date.parse("2026-10-06T23:05:00Z"))).toBe(2);
    expect(sqlite.prepare("SELECT closing_odds AS o, closing_prob AS p FROM picks WHERE game_id = ?").get(game.id)).toEqual({ o: 2.5, p: 0.38 });
    expect(sqlite.prepare("SELECT closing_odds AS o, closing_prob AS p FROM bets WHERE game_id = ?").get(game.id)).toEqual({ o: 1.48, p: 0.65 });
  });

  it("ignores reads with no prices at all", () => {
    saveSnapshot({ ...game, id: 2026020102 }, { sources: [] });
    expect(loadSnapshot(2026020102)).toBeNull();
  });
});

describe("blending toward the market", () => {
  it("moves the market a fraction of the way to the model", () => {
    expect(blend(0.55, 0.7, 0.2)).toBeCloseTo(0.67);
    expect(blend(0.55, 0.7, 0)).toBe(0.7);
    expect(blend(0.55, 0.7, 1)).toBe(0.55);
  });

  it("fits the weight that best predicts results", () => {
    // Outcomes drawn from the market: the model adds nothing, so the fit should stay near 0.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rows = Array.from({ length: 4000 }, () => {
      const market = 0.3 + 0.4 * rand();
      const model = 0.5 + (rand() - 0.5) * 0.2;
      return { model, market, won: rand() < market };
    });
    expect(fitBlendWeight(rows)).toBeLessThan(0.1);
    // Outcomes drawn from the model: the fit should lean on the model.
    const modelRows = rows.map((r) => ({ ...r, won: rand() < r.model }));
    expect(fitBlendWeight(modelRows)).toBeGreaterThan(0.7);
  });
});
