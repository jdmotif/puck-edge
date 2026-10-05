import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEspn, parseNhl, parseRss, plainText } from "./parse";
import { tagTeams } from "./teams";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "../../../fixtures", name), "utf8");

describe("tagTeams", () => {
  it("matches nicknames and full names", () => {
    expect(tagTeams("Oilers beat Maple Leafs in overtime")).toEqual(["EDM", "TOR"]);
    expect(tagTeams("Canadiens, Montréal Canadiens")).toEqual(["MTL"]);
    expect(tagTeams("St. Louis Blues recall forward")).toEqual(["STL"]);
  });
  it("needs the full name for nicknames that are common words", () => {
    expect(tagTeams("An early look at the wild card race", "three stars of the night")).toEqual([]);
    expect(tagTeams("Texas Rangers and New York Jets")).toEqual([]);
    expect(tagTeams("Minnesota Wild and Dallas Stars")).toEqual(["DAL", "MIN"]);
  });
});

describe("parsers", () => {
  it("reads ESPN news JSON", () => {
    const items = parseEspn("espn", JSON.parse(fixture("news_espn.json")));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: "espn",
      url: "https://www.espn.com/nhl/story/_/id/00000001/sample-oilers-extension",
      image: "https://a.espncdn.com/photo/2026/1005/sample.jpg",
      publishedAt: Date.parse("2026-10-05T19:42:00Z"),
      teams: ["EDM"],
    });
    expect(items[1].image).toBeUndefined();
  });

  it("reads NHL.com stories and builds article links from the slug", () => {
    const items = parseNhl("nhl", JSON.parse(fixture("news_nhl.json")));
    expect(items[0].url).toBe("https://www.nhl.com/news/sample-bruins-senators-preview-october-5-2026");
    expect(items[0].teams).toEqual(["BOS", "OTT"]);
    expect(items[0].image).toContain("t_ratio16_9");
    expect(items[1].teams).toEqual([]);
  });

  it("reads RSS with CDATA, entities and media images", () => {
    const items = parseRss("sportsnet", fixture("news_sportsnet.xml"));
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Sample: Canucks’ captain cleared to play");
    expect(items[0].summary).toMatch(/^SAMPLE ARTICLE/);
    expect(items[0].image).toBe("https://www.sportsnet.ca/wp-content/uploads/sample.jpg");
    expect(items[0].publishedAt).toBe(Date.parse("2026-10-05T20:15:00Z"));
    expect(items[0].teams).toEqual(["VAN"]);
  });

  it("reads Atom entries", () => {
    const xml = `<feed><entry><title>Kraken win</title><link rel="alternate" href="https://example.com/a"/><updated>2026-10-05T10:00:00Z</updated><summary>Seattle Kraken</summary></entry></feed>`;
    expect(parseRss("x", xml)[0]).toMatchObject({ url: "https://example.com/a", teams: ["SEA"] });
  });

  it("drops items without a title or link and ignores non-http links", () => {
    expect(parseEspn("espn", { articles: [{ headline: "No link" }, { links: { web: { href: "https://x.com" } } }] })).toEqual([]);
    expect(parseRss("x", "<item><title>t</title><link>javascript:alert(1)</link></item>")).toEqual([]);
  });

  it("strips tags and trims long summaries", () => {
    expect(plainText("<p>a &amp; <b>b</b></p>")).toBe("a & b");
    expect(plainText("word ".repeat(100), 20)!.length).toBeLessThanOrEqual(20);
  });
});
