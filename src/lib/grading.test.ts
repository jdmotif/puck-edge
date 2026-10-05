import { describe, expect, it } from "vitest";
import { outcomeFor, profitFor } from "./grading";

const g = { home: "DET", away: "WPG", homeScore: 2, awayScore: 3 };

describe("settlement", () => {
  it("moneyline", () => {
    expect(outcomeFor("moneyline", "WPG", null, g)).toBe("win");
    expect(outcomeFor("moneyline", "DET", null, g)).toBe("loss");
  });

  it("totals with half and whole lines", () => {
    expect(outcomeFor("total", "under", 5.5, g)).toBe("win");
    expect(outcomeFor("total", "over", 5.5, g)).toBe("loss");
    expect(outcomeFor("total", "over", 5, g)).toBe("push");
    expect(outcomeFor("total", "over", 4.5, g)).toBe("win");
  });

  it("puck line", () => {
    expect(outcomeFor("puckline", "WPG", -1.5, g)).toBe("loss");
    expect(outcomeFor("puckline", "DET", 1.5, g)).toBe("win");
    expect(outcomeFor("puckline", "WPG", -1.5, { ...g, awayScore: 5 })).toBe("win");
  });

  it("props, including a scratched player", () => {
    expect(outcomeFor("prop_goal", "1", null, g, { goals: 1, points: 2 })).toBe("win");
    expect(outcomeFor("prop_point2", "1", null, g, { goals: 0, points: 1 })).toBe("loss");
    expect(outcomeFor("prop_point1", "1", null, g, null)).toBe("void");
  });

  it("profit", () => {
    expect(profitFor("win", 10, 2.5)).toBe(15);
    expect(profitFor("loss", 10, 2.5)).toBe(-10);
    expect(profitFor("push", 10, 2.5)).toBe(0);
  });
});
