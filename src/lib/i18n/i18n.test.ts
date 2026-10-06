import { describe, expect, it } from "vitest";
import { i18n, localeFromAcceptLanguage, pickLabel } from "./index";
import { parseOdds } from "@/lib/model/math";

const NB = " ";
const fr = i18n("fr");
const en = i18n("en");

describe("formatting", () => {
  it("writes numbers the Québec way in French", () => {
    expect(fr.f.pct(0.543)).toBe(`54${NB}%`);
    expect(fr.f.signedPct(-0.031)).toBe(`−3,1${NB}%`);
    expect(fr.f.money(1234.5)).toBe(`1${NB}234,50${NB}$`);
    expect(fr.f.money(-12)).toBe(`−12,00${NB}$`);
    expect(fr.f.line(6.5)).toBe("6,5");
    expect(fr.f.line(-1.5, true)).toBe("−1,5");
    expect(fr.f.svPct(0.9154)).toBe(",915");
    expect(fr.f.season(20262027)).toBe("2026-2027");
  });

  it("leaves English output as it was", () => {
    expect(en.f.pct(0.543)).toBe("54%");
    expect(en.f.money(-12)).toBe("−$12.00");
    expect(en.f.line(1.5, true)).toBe("+1.5");
    expect(en.f.svPct(0.9154)).toBe(".915");
    expect(en.f.season(20262027)).toBe("2026–27");
  });
});

describe("betting vocabulary", () => {
  it("uses Mise-O-Jeu terms for markets and labels", () => {
    expect(fr.t.markets.moneyline).toBe("Gagnant du match");
    expect(fr.t.markets.puckline).toBe("Écart de buts");
    expect(fr.t.label.total(true, 6.5)).toBe("Plus de 6,5");
    expect(fr.t.label.total(false, 5.5)).toBe("Moins de 5,5");
    expect(fr.t.stats.streak("W", 3)).toBe("V3");
    expect(fr.t.status.final("SO")).toBe("Final (TB)");
  });

  it("re-labels stored English picks and bets in French", () => {
    expect(pickLabel(fr.t, "moneyline", "MTL", null, "MTL moneyline")).toBe("MTL gagnant");
    expect(pickLabel(fr.t, "puckline", "TOR", 1.5, "TOR +1.5")).toBe("TOR +1,5");
    expect(pickLabel(fr.t, "prop_goal", "8478402", null, "Connor McDavid anytime goal")).toBe("Connor McDavid marque un but");
    expect(pickLabel(en.t, "prop_point2", "8478402", null, "Connor McDavid 2+ points")).toBe("Connor McDavid 2+ points");
  });
});

describe("language detection", () => {
  it("prefers French when the browser asks for it first", () => {
    expect(localeFromAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,fr;q=0.5")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });
});

describe("odds input", () => {
  it("accepts a decimal comma and a typographic minus", () => {
    expect(parseOdds("1,91")).toBeCloseTo(1.91);
    expect(parseOdds("−110")).toBeCloseTo(1.909, 3);
  });
});
