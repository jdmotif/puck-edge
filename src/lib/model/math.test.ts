import { describe, expect, it } from "vitest";
import {
  americanToDecimal,
  calibration,
  decimalToAmerican,
  edge,
  expectedValue,
  fitLogistic,
  gameDistribution,
  kellyFraction,
  lambdasFor,
  overround,
  parseOdds,
  poissonAtLeast,
  poissonCdf,
  poissonPmf,
  probAtLeastOne,
  probAtLeastTwo,
  puckLineProbs,
  removeMargin,
  removeMarginPower,
  shrink,
  sigmoid,
  totalProbs,
} from "./math";

describe("odds conversion", () => {
  it("converts American to decimal", () => {
    expect(americanToDecimal(100)).toBeCloseTo(2.0);
    expect(americanToDecimal(184)).toBeCloseTo(2.84);
    expect(americanToDecimal(-225)).toBeCloseTo(1.4444, 4);
    expect(americanToDecimal(-100)).toBeCloseTo(2.0);
  });

  it("converts decimal to American", () => {
    expect(decimalToAmerican(2.84)).toBe(184);
    expect(decimalToAmerican(1.4444444)).toBe(-225);
    expect(decimalToAmerican(2)).toBe(100);
  });

  it("round-trips", () => {
    for (const a of [-400, -150, -110, 105, 150, 320]) expect(decimalToAmerican(americanToDecimal(a))).toBe(a);
  });

  it("parses the formats the NHL schedule uses", () => {
    expect(parseOdds("+184")).toBeCloseTo(2.84);
    expect(parseOdds("-225")).toBeCloseTo(1.4444, 4);
    expect(parseOdds("3.10")).toBeCloseTo(3.1);
    expect(parseOdds("1.37")).toBeCloseTo(1.37);
    expect(parseOdds(-3000)).toBeCloseTo(1.0333, 4);
    expect(parseOdds("")).toBeNull();
    expect(parseOdds("abc")).toBeNull();
  });

  it("rejects invalid odds", () => {
    expect(() => americanToDecimal(0)).toThrow();
    expect(() => decimalToAmerican(1)).toThrow();
  });
});

describe("margin removal", () => {
  // PHI +184 / TBL -225 from the 2026-10-05 schedule fixture
  const market = [americanToDecimal(184), americanToDecimal(-225)];

  it("measures the overround", () => {
    expect(overround(market)).toBeCloseTo(1 / 2.84 + 225 / 325 - 1, 10);
    expect(overround([2, 2])).toBeCloseTo(0);
  });

  it("multiplicative method sums to 1 and keeps the ratio", () => {
    const fair = removeMargin(market);
    expect(fair[0] + fair[1]).toBeCloseTo(1, 10);
    expect(fair[0] / fair[1]).toBeCloseTo((1 / market[0]) / (1 / market[1]), 10);
    expect(fair[0]).toBeLessThan(1 / market[0]);
  });

  it("power method sums to 1 and takes more off the longshot", () => {
    const mult = removeMargin(market);
    const pow = removeMarginPower(market);
    expect(pow[0] + pow[1]).toBeCloseTo(1, 8);
    expect(pow[0]).toBeLessThan(mult[0]);
  });

  it("is a no-op on a fair market", () => {
    expect(removeMargin([2, 2])).toEqual([0.5, 0.5]);
    const p = removeMarginPower([4, 4 / 3]);
    expect(p[0]).toBeCloseTo(0.25, 6);
  });

  it("computes edge and EV", () => {
    expect(edge(0.55, 0.5)).toBeCloseTo(0.05);
    expect(expectedValue(0.5, 2)).toBeCloseTo(0);
    expect(expectedValue(0.55, 2)).toBeCloseTo(0.1);
  });
});

describe("Kelly", () => {
  it("matches the closed form", () => {
    // p=0.55 at evens: full Kelly = 0.10
    expect(kellyFraction(0.55, 2, 1)).toBeCloseTo(0.1);
    expect(kellyFraction(0.55, 2, 0.25)).toBeCloseTo(0.025);
  });

  it("returns 0 for no edge or negative edge", () => {
    expect(kellyFraction(0.5, 2)).toBe(0);
    expect(kellyFraction(0.4, 2)).toBe(0);
    expect(kellyFraction(0.6, 1)).toBe(0);
  });

  it("respects the cap", () => {
    expect(kellyFraction(0.9, 3, 1, 0.05)).toBe(0.05);
  });
});

describe("Poisson", () => {
  it("pmf matches known values", () => {
    expect(poissonPmf(0, 3)).toBeCloseTo(Math.exp(-3), 12);
    expect(poissonPmf(2, 3)).toBeCloseTo((9 / 2) * Math.exp(-3), 12);
    expect(poissonPmf(-1, 3)).toBe(0);
    expect(poissonPmf(0, 0)).toBe(1);
  });

  it("pmf sums to 1", () => {
    let s = 0;
    for (let k = 0; k < 40; k++) s += poissonPmf(k, 3.1);
    expect(s).toBeCloseTo(1, 10);
  });

  it("cdf and tail are consistent", () => {
    expect(poissonCdf(2, 3) + poissonAtLeast(3, 3)).toBeCloseTo(1, 12);
    expect(poissonAtLeast(0, 3)).toBe(1);
  });

  it("props helpers", () => {
    expect(probAtLeastOne(0.4)).toBeCloseTo(1 - Math.exp(-0.4));
    expect(probAtLeastTwo(1)).toBeCloseTo(1 - 2 * Math.exp(-1));
    expect(probAtLeastTwo(0.5)).toBeCloseTo(poissonAtLeast(2, 0.5), 12);
  });
});

describe("game distribution", () => {
  const d = gameDistribution(3.3, 2.8);

  it("outcomes sum to 1", () => {
    expect(d.homeRegWin + d.awayRegWin + d.regTie).toBeCloseTo(1, 6);
    expect(d.homeWin + d.awayWin).toBeCloseTo(1, 6);
    expect(d.totalDist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("is symmetric for equal teams", () => {
    const e = gameDistribution(3, 3);
    expect(e.homeWin).toBeCloseTo(0.5, 10);
    expect(e.homeBy2).toBeCloseTo(e.awayBy2, 10);
  });

  it("favours the stronger side", () => {
    expect(d.homeWin).toBeGreaterThan(0.5);
    expect(d.homeBy2).toBeGreaterThan(d.awayBy2);
  });

  it("a tie in regulation adds one goal to the total", () => {
    const zero = gameDistribution(0.0001, 0.0001);
    // essentially always 0-0 → settles as 1 total goal
    expect(zero.totalDist[1]).toBeGreaterThan(0.99);
  });

  it("totals: over + under + push = 1, push only on whole lines", () => {
    const half = totalProbs(d, 6.5);
    expect(half.over + half.under).toBeCloseTo(1, 6);
    expect(half.push).toBe(0);
    const whole = totalProbs(d, 6);
    expect(whole.over + whole.under + whole.push).toBeCloseTo(1, 6);
    expect(whole.push).toBeGreaterThan(0);
    expect(totalProbs(d, 5.5).over).toBeGreaterThan(half.over);
  });

  it("puck line: complementary sides and empty-net shift", () => {
    const pl = puckLineProbs(d);
    expect(pl.homeMinus15 + pl.awayPlus15).toBeCloseTo(1, 10);
    expect(pl.homeMinus15).toBeCloseTo(d.homeBy2 + d.homeBy1 * 0.18, 10);
    expect(puckLineProbs(d, 0).homeMinus15).toBeCloseTo(d.homeBy2, 10);
    expect(pl.homeMinus15).toBeLessThan(d.homeWin);
  });

  it("lambdasFor recovers a target", () => {
    const { lambdaHome, lambdaAway } = lambdasFor(0.6, 6.1);
    expect(lambdaHome + lambdaAway).toBeCloseTo(6.1, 6);
    expect(gameDistribution(lambdaHome, lambdaAway).homeWin).toBeCloseTo(0.6, 3);
  });
});

describe("logistic + calibration", () => {
  it("fits a separable signal", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 400; i++) {
      const x = (i % 40) / 10 - 2;
      X.push([x]);
      y.push(sigmoid(1.5 * x + 0.2) > ((i * 7919) % 100) / 100 ? 1 : 0);
    }
    const { weights, intercept } = fitLogistic(X, y, { l2: 0, iters: 4000, lr: 0.5 });
    expect(weights[0]).toBeGreaterThan(0.8);
    expect(Math.abs(intercept)).toBeLessThan(0.6);
  });

  it("buckets predictions", () => {
    const c = calibration([0.05, 0.55, 0.58, 0.99], [0, 1, 0, 1]);
    expect(c).toHaveLength(10);
    expect(c[0].n).toBe(1);
    expect(c[5].n).toBe(2);
    expect(c[5].actual).toBe(0.5);
    expect(c[9].n).toBe(1);
  });

  it("shrinks toward the prior", () => {
    expect(shrink(1, 0, 0.5, 10)).toBe(0.5);
    expect(shrink(1, 10, 0.5, 10)).toBe(0.75);
  });
});
