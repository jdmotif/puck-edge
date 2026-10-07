import { describe, expect, it } from "vitest";
import { bestPrices, mergeRows, oddsApiCountry } from "./odds-board";

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
