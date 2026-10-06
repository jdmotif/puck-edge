import { describe, expect, it } from "vitest";
import { appPathOf, bootScript, toStaticHref } from "./paths";

const B = "/puck-edge";

describe("static site URLs", () => {
  it("maps app links to saved folders", () => {
    expect(toStaticHref("/", B, false)).toBe("/puck-edge/");
    expect(toStaticHref("/standings", B, false)).toBe("/puck-edge/standings/");
    expect(toStaticHref("/standings?view=league", B, true)).toBe("/puck-edge/fr/standings/_q/view=league/");
    // Query order and empty form fields don't matter.
    expect(toStaticHref("/schedule?view=week&date=2026-10-12", B, false)).toBe("/puck-edge/schedule/_q/date=2026-10-12/view=week/");
    expect(toStaticHref("/schedule/?date=2026-10-12&team=&view=week", B, false)).toBe("/puck-edge/schedule/_q/date=2026-10-12/view=week/");
    expect(toStaticHref("/game/2026020044#box", B, false)).toBe("/puck-edge/game/2026020044/#box");
  });

  it("keeps the bet tracker's prefill as a real query", () => {
    expect(toStaticHref("/bets?game=1&odds=1.9", B, false)).toBe("/puck-edge/bets/?game=1&odds=1.9");
  });

  it("reads the route back from a static URL", () => {
    expect(appPathOf("/fr/standings/_q/view=league/", "")).toEqual({ fr: true, path: "/standings" });
    expect(appPathOf("/puck-edge/fr/", B)).toEqual({ fr: true, path: "/" });
    expect(appPathOf("/puck-edge/game/1/", B)).toEqual({ fr: false, path: "/game/1" });
  });

  it("inlines a boot script that parses", () => {
    expect(() => new Function(bootScript(B))).not.toThrow();
  });
});
