import { describe, expect, it } from "vitest";
import { bestPrices, mergeRows, oddsApiCountry, oddsApiRows } from "./odds-board";

describe("odds board", () => {
  it("merges the same book from two feeds and drops a swapped moneyline", () => {
    const rows = mergeRows(
      [{ book: "DraftKings", country: "US", pl: { homeLine: -1.5, away: 1.6, home: 2.4 } }],
      [
        { book: "Draft Kings", country: "US", ml: { away: 2.5, home: 1.55 } },
        { book: "FanDuel", country: "CA", ml: { away: 2.45, home: 1.57 } },
        { book: "Veikkaus", country: "FI", ml: { away: 1.57, home: 2.42 } },
      ],
    );
    expect(rows.map((r) => r.book)).toEqual(["FanDuel", "DraftKings"]);
    expect(rows[1].ml && rows[1].pl).toBeTruthy();
    expect(bestPrices(rows)).toMatchObject({ mlAway: 2.5, mlHome: 1.57, plLine: -1.5 });
  });

  it("reads the country from the bookmaker key", () => {
    expect(oddsApiCountry("winamax_fr", ["us", "fr"])).toBe("FR");
    expect(oddsApiCountry("draftkings", ["us", "fr"])).toBe("US");
    expect(oddsApiCountry("betclic", ["fr"])).toBe("FR");
  });
});

describe("3-way prices", () => {
  it("keeps a book that only prices the 60-minute result", () => {
    const ev = {
      id: "x", commence_time: "2026-10-07T23:00:00Z", home_team: "Boston Bruins", away_team: "Ottawa Senators",
      bookmakers: [{ key: "winamax_fr", title: "Winamax (FR)", markets: [{ key: "h2h" as const, outcomes: [
        { name: "Boston Bruins", price: 2.3 }, { name: "Ottawa Senators", price: 2.6 }, { name: "Draw", price: 4.1 },
      ] }] }],
    };
    const rows = oddsApiRows(ev, ["us", "fr"]);
    expect(rows).toEqual([{ book: "Winamax (FR)", country: "FR", ml3: { away: 2.6, draw: 4.1, home: 2.3 } }]);
    expect(bestPrices(mergeRows(rows)).mlHome).toBeNull();
  });
});
