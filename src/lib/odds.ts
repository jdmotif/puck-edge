// Market odds: moneylines embedded in the NHL schedule, plus an optional The Odds API adapter
// for totals and puck lines. Everything degrades to "no odds" without breaking the picks.
import { sqlite } from "@/db";
import { overround, parseOdds, removeMargin } from "@/lib/model/math";
import type { OddsPartner, ScheduleGame } from "@/lib/nhl/types";

export interface SidePrice {
  fair: number; // margin-free probability, averaged across books
  best: number; // best decimal price available
  bestBook: string;
  books: number;
}

export interface MarketOdds {
  moneyline?: { home: SidePrice; away: SidePrice };
  total?: { line: number; over: SidePrice; under: SidePrice };
  puckline?: { homeLine: number; home: SidePrice; away: SidePrice }; // homeLine is -1.5 or +1.5
  sources: string[];
}

const MAX_OVERROUND = 0.12; // anything above this is probably a 3-way (regulation) price

function combine(pairs: { book: string; a: number; b: number }[]): [SidePrice, SidePrice] | null {
  const valid = pairs.filter((p) => {
    const o = overround([p.a, p.b]);
    return o >= -0.01 && o <= MAX_OVERROUND;
  });
  if (!valid.length) return null;
  const fairA = valid.reduce((s, p) => s + removeMargin([p.a, p.b])[0], 0) / valid.length;
  const bestA = valid.reduce((m, p) => (p.a > m.a ? p : m), valid[0]);
  const bestB = valid.reduce((m, p) => (p.b > m.b ? p : m), valid[0]);
  return [
    { fair: fairA, best: bestA.a, bestBook: bestA.book, books: valid.length },
    { fair: 1 - fairA, best: bestB.b, bestBook: bestB.book, books: valid.length },
  ];
}

/** Moneyline from the `odds` arrays the NHL schedule attaches to each team. */
export function scheduleMoneyline(game: ScheduleGame, partners: OddsPartner[] = []): MarketOdds["moneyline"] {
  const away = game.awayTeam.odds ?? [];
  const home = game.homeTeam.odds ?? [];
  const pairs: { book: string; a: number; b: number }[] = [];
  for (const h of home) {
    const a = away.find((o) => o.providerId === h.providerId);
    const hd = parseOdds(h.value);
    const ad = a ? parseOdds(a.value) : null;
    if (!hd || !ad) continue;
    const name = partners.find((p) => p.partnerId === h.providerId)?.name ?? `Book ${h.providerId}`;
    pairs.push({ book: name, a: hd, b: ad });
  }
  const c = combine(pairs);
  return c ? { home: c[0], away: c[1] } : undefined;
}

// ---------- The Odds API (optional) ----------

interface OddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    markets: { key: "h2h" | "totals" | "spreads"; outcomes: { name: string; price: number; point?: number }[] }[];
  }[];
}

const ODDS_TTL = 15 * 60_000;

export async function fetchOddsApi(): Promise<{ events: OddsApiEvent[]; error?: string; fetchedAt?: number }> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { events: [] };
  const region = process.env.ODDS_API_REGION || "us";
  const cacheKey = `oddsapi:${region}`;
  const row = sqlite.prepare("SELECT body, fetched_at FROM api_cache WHERE key = ?").get(cacheKey) as
    | { body: string; fetched_at: number }
    | undefined;
  if (row && Date.now() - row.fetched_at < ODDS_TTL) return { events: JSON.parse(row.body), fetchedAt: row.fetched_at };
  try {
    const url = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?apiKey=${encodeURIComponent(key)}&regions=${region}&markets=h2h,totals,spreads&oddsFormat=decimal`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    if (!res.ok) throw new Error(`The Odds API ${res.status}`);
    const events = (await res.json()) as OddsApiEvent[];
    sqlite
      .prepare("INSERT INTO api_cache (key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at")
      .run(cacheKey, JSON.stringify(events), Date.now(), Date.now() + ODDS_TTL);
    return { events, fetchedAt: Date.now() };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return row ? { events: JSON.parse(row.body), error, fetchedAt: row.fetched_at } : { events: [], error };
  }
}

/** Match an Odds API event to an NHL game by team nickname (e.g. "Tampa Bay Lightning" ends with "Lightning"). */
export function findEvent(events: OddsApiEvent[], game: ScheduleGame) {
  const nick = (t: ScheduleGame["homeTeam"]) => t.commonName.default.toLowerCase();
  return events.find(
    (e) =>
      e.home_team.toLowerCase().endsWith(nick(game.homeTeam)) &&
      e.away_team.toLowerCase().endsWith(nick(game.awayTeam)) &&
      Math.abs(Date.parse(e.commence_time) - Date.parse(game.startTimeUTC)) < 36 * 3_600_000,
  );
}

export function oddsApiMarkets(ev: OddsApiEvent): Omit<MarketOdds, "sources"> {
  const out: Omit<MarketOdds, "sources"> = {};
  const h2h: { book: string; a: number; b: number }[] = [];
  const totals = new Map<number, { book: string; a: number; b: number }[]>();
  const spreads = new Map<number, { book: string; a: number; b: number }[]>();
  for (const bk of ev.bookmakers) {
    for (const m of bk.markets) {
      if (m.key === "h2h") {
        const h = m.outcomes.find((o) => o.name === ev.home_team);
        const a = m.outcomes.find((o) => o.name === ev.away_team);
        if (h && a) h2h.push({ book: bk.title, a: h.price, b: a.price });
      } else if (m.key === "totals") {
        const o = m.outcomes.find((x) => x.name === "Over");
        const u = m.outcomes.find((x) => x.name === "Under");
        if (o && u && o.point !== undefined) {
          const list = totals.get(o.point) ?? [];
          list.push({ book: bk.title, a: o.price, b: u.price });
          totals.set(o.point, list);
        }
      } else if (m.key === "spreads") {
        const h = m.outcomes.find((o) => o.name === ev.home_team);
        const a = m.outcomes.find((o) => o.name === ev.away_team);
        if (h && a && h.point !== undefined && Math.abs(h.point) === 1.5) {
          const list = spreads.get(h.point) ?? [];
          list.push({ book: bk.title, a: h.price, b: a.price });
          spreads.set(h.point, list);
        }
      }
    }
  }
  const ml = combine(h2h);
  if (ml) out.moneyline = { home: ml[0], away: ml[1] };
  // Use the line most books are offering.
  const mode = <T,>(m: Map<number, T[]>) => [...m.entries()].sort((x, y) => y[1].length - x[1].length)[0];
  const t = mode(totals);
  if (t) {
    const c = combine(t[1]);
    if (c) out.total = { line: t[0], over: c[0], under: c[1] };
  }
  const s = mode(spreads);
  if (s) {
    const c = combine(s[1]);
    if (c) out.puckline = { homeLine: s[0], home: c[0], away: c[1] };
  }
  return out;
}

/** All market odds we can find for a scheduled game. */
export function marketFor(game: ScheduleGame, partners: OddsPartner[], events: OddsApiEvent[]): MarketOdds {
  const sources: string[] = [];
  const out: MarketOdds = { sources };
  const ml = scheduleMoneyline(game, partners);
  if (ml) {
    out.moneyline = ml;
    sources.push("NHL schedule odds");
  }
  const ev = findEvent(events, game);
  if (ev) {
    const m = oddsApiMarkets(ev);
    if (m.moneyline && !out.moneyline) out.moneyline = m.moneyline;
    if (m.total) out.total = m.total;
    if (m.puckline) out.puckline = m.puckline;
    sources.push("The Odds API");
  }
  return out;
}
