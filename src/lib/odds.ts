// Market odds: moneylines embedded in the NHL schedule, totals and puck lines from the NHL's
// partner-game feed (one book per country), plus an optional The Odds API adapter.
// Everything degrades to "no odds" without breaking the picks.
import { sqlite } from "@/db";
import { overround, parseOdds, removeMargin } from "@/lib/model/math";
import type { OddsPartner, PartnerGameResponse, ScheduleGame } from "@/lib/nhl/types";

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

type Pair = { book: string; a: number; b: number; local?: boolean };

/**
 * Margin-free consensus across every book; the best price only from books the user can bet at
 * (`local`), when any of them prices the market.
 */
function combine(pairs: Pair[]): [SidePrice, SidePrice] | null {
  const valid = pairs.filter((p) => {
    const o = overround([p.a, p.b]);
    return o >= -0.01 && o <= MAX_OVERROUND;
  });
  if (!valid.length) return null;
  // Drop books whose fair price is far from the median: usually a stale line or a mislabelled market.
  const fair = (p: { a: number; b: number }) => removeMargin([p.a, p.b])[0];
  const sorted = valid.map(fair).sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (valid.length >= 3) {
    const kept = valid.filter((p) => Math.abs(fair(p) - median) <= 0.06);
    valid.splice(0, valid.length, ...kept);
  }
  const fairA = valid.reduce((s, p) => s + removeMargin([p.a, p.b])[0], 0) / valid.length;
  const bettable = valid.some((p) => p.local) ? valid.filter((p) => p.local) : valid;
  const bestA = bettable.reduce((m, p) => (p.a > m.a ? p : m), bettable[0]);
  const bestB = bettable.reduce((m, p) => (p.b > m.b ? p : m), bettable[0]);
  return [
    { fair: fairA, best: bestA.a, bestBook: bestA.book, books: valid.length },
    { fair: 1 - fairA, best: bestB.b, bestBook: bestB.book, books: valid.length },
  ];
}

/** Moneyline from the `odds` arrays the NHL schedule attaches to each team. */
export function scheduleMoneyline(game: ScheduleGame, partners: OddsPartner[] = [], country?: string): MarketOdds["moneyline"] {
  const away = game.awayTeam.odds ?? [];
  const home = game.homeTeam.odds ?? [];
  const pairs: Pair[] = [];
  for (const h of home) {
    const a = away.find((o) => o.providerId === h.providerId);
    const hd = parseOdds(h.value);
    const ad = a ? parseOdds(a.value) : null;
    if (!hd || !ad) continue;
    const partner = partners.find((p) => p.partnerId === h.providerId);
    pairs.push({ book: partner?.name ?? `Book ${h.providerId}`, a: hd, b: ad, local: !!country && partner?.country === country });
  }
  const c = combine(pairs);
  return c ? { home: c[0], away: c[1] } : undefined;
}

// ---------- partner-game/{country}/now ----------

export type PartnerGame = PartnerGameResponse["games"][number];

/** Totals and puck line from the country's betting partner (e.g. FanDuel in CA, DraftKings in US). */
export function partnerMarkets(pg: PartnerGame, book: string): Omit<MarketOdds, "sources" | "moneyline"> {
  const out: Omit<MarketOdds, "sources" | "moneyline"> = {};
  const find = (odds: PartnerGame["homeTeam"]["odds"], desc: string) => odds.find((o) => o.description === desc);
  const ho = find(pg.homeTeam.odds, "OVER_UNDER");
  const ao = find(pg.awayTeam.odds, "OVER_UNDER");
  // The over sits on one team and the under on the other, e.g. "O5.5" / "U5.5".
  const over = [ho, ao].find((o) => o?.qualifier.startsWith("O"));
  const under = [ho, ao].find((o) => o?.qualifier.startsWith("U"));
  const line = over ? Number(over.qualifier.slice(1)) : NaN;
  if (over && under && Number.isFinite(line) && Number(under.qualifier.slice(1)) === line) {
    const a = parseOdds(over.value);
    const b = parseOdds(under.value);
    const c = a && b ? combine([{ book, a, b, local: true }]) : null;
    if (c) out.total = { line, over: c[0], under: c[1] };
  }
  const hp = find(pg.homeTeam.odds, "PUCK_LINE");
  const ap = find(pg.awayTeam.odds, "PUCK_LINE");
  const homeLine = hp ? Number(hp.qualifier) : NaN;
  if (hp && ap && Math.abs(homeLine) === 1.5 && Number(ap.qualifier) === -homeLine) {
    const a = parseOdds(hp.value);
    const b = parseOdds(ap.value);
    const c = a && b ? combine([{ book, a, b, local: true }]) : null;
    if (c) out.puckline = { homeLine, home: c[0], away: c[1] };
  }
  return out;
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
  const h2h: Pair[] = [];
  const totals = new Map<number, Pair[]>();
  const spreads = new Map<number, Pair[]>();
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

/** All market odds we can find for a scheduled game. `country` limits "best price" to books the user can bet at. */
export function marketFor(
  game: ScheduleGame,
  partners: OddsPartner[],
  events: OddsApiEvent[],
  partnerGame?: { game: PartnerGame; book: string },
  country?: string,
): MarketOdds {
  const sources: string[] = [];
  const out: MarketOdds = { sources };
  const ml = scheduleMoneyline(game, partners, country);
  if (ml) {
    out.moneyline = ml;
    sources.push("NHL schedule odds");
  }
  if (partnerGame) {
    const m = partnerMarkets(partnerGame.game, partnerGame.book);
    if (m.total) out.total = m.total;
    if (m.puckline) out.puckline = m.puckline;
    if (m.total || m.puckline) sources.push(`${partnerGame.book} (NHL partner feed)`);
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
