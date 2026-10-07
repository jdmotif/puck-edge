// Odds comparison: every sportsbook's price for each game, side by side. Sources are the moneylines in
// the NHL schedule (one per partner book), the NHL partner-game feeds (moneyline, puck line and total
// from one book per country) and, with ODDS_API_KEY, The Odds API for the regions in ODDS_API_REGION
// (e.g. `us,fr` for American and French books).
import { overround, parseOdds, removeMargin } from "@/lib/model/math";
import type { OddsPartner, PartnerGameResponse, ScheduleGame } from "@/lib/nhl/types";
import type { OddsApiEvent } from "@/lib/odds";

/** One book's prices for a game (decimal odds). */
export interface BookRow {
  book: string;
  country: string; // ISO 3166 alpha-2 (US, FR, CA, SE…), "" when unknown
  ml?: { away: number; home: number };
  pl?: { homeLine: number; away: number; home: number }; // homeLine is −1.5 or +1.5
  total?: { line: number; over: number; under: number };
}

const MAX_OVERROUND = 0.12; // above this the price is probably 3-way (regulation time)
const twoWay = (a: number, b: number) => {
  const o = overround([a, b]);
  return o >= -0.01 && o <= MAX_OVERROUND;
};

const ALPHA3: Record<string, string> = { USA: "US", CAN: "CA", SWE: "SE", DEU: "DE", FIN: "FI", CZE: "CZ", SVK: "SK", FRA: "FR", GBR: "GB" };
export const country2 = (c: string) => (c.length === 3 ? ALPHA3[c] ?? c.slice(0, 2) : c).toUpperCase();

/** Moneylines the schedule attaches to each team, one row per partner book. */
export function scheduleRows(game: ScheduleGame, partners: OddsPartner[]): BookRow[] {
  const rows: BookRow[] = [];
  for (const h of game.homeTeam.odds ?? []) {
    const a = (game.awayTeam.odds ?? []).find((o) => o.providerId === h.providerId);
    const home = parseOdds(h.value);
    const away = a ? parseOdds(a.value) : null;
    if (!home || !away || !twoWay(home, away)) continue;
    const p = partners.find((x) => x.partnerId === h.providerId);
    rows.push({ book: p?.name ?? `Book ${h.providerId}`, country: p ? country2(p.country) : "", ml: { away, home } });
  }
  return rows;
}

type PartnerGame = PartnerGameResponse["games"][number];

/** Moneyline, puck line and total from one country's NHL betting partner. */
export function partnerRow(pg: PartnerGame, partner: OddsPartner): BookRow | null {
  const row: BookRow = { book: partner.name, country: country2(partner.country) };
  const find = (odds: PartnerGame["homeTeam"]["odds"], desc: string) => odds.find((o) => o.description === desc);
  const hm = find(pg.homeTeam.odds, "MONEY_LINE_2_WAY");
  const am = find(pg.awayTeam.odds, "MONEY_LINE_2_WAY");
  const home = hm && parseOdds(hm.value);
  const away = am && parseOdds(am.value);
  if (home && away && twoWay(home, away)) row.ml = { away, home };
  const hp = find(pg.homeTeam.odds, "PUCK_LINE");
  const ap = find(pg.awayTeam.odds, "PUCK_LINE");
  const homeLine = hp ? Number(hp.qualifier) : NaN;
  if (hp && ap && Math.abs(homeLine) === 1.5 && Number(ap.qualifier) === -homeLine) {
    const h = parseOdds(hp.value);
    const a = parseOdds(ap.value);
    if (h && a && twoWay(h, a)) row.pl = { homeLine, away: a, home: h };
  }
  const ou = [find(pg.homeTeam.odds, "OVER_UNDER"), find(pg.awayTeam.odds, "OVER_UNDER")];
  const over = ou.find((o) => o?.qualifier.startsWith("O"));
  const under = ou.find((o) => o?.qualifier.startsWith("U"));
  const line = over ? Number(over.qualifier.slice(1)) : NaN;
  if (over && under && Number.isFinite(line) && Number(under.qualifier.slice(1)) === line) {
    const o = parseOdds(over.value);
    const u = parseOdds(under.value);
    if (o && u && twoWay(o, u)) row.total = { line, over: o, under: u };
  }
  return row.ml || row.pl || row.total ? row : null;
}

/** Country of an Odds API bookmaker: its key's suffix (`winamax_fr`), else the only region asked for, else US. */
export function oddsApiCountry(key: string, regions: string[]): string {
  const m = /_(fr|uk|se|it|es|de|au|eu|nl|be|dk)$/.exec(key);
  if (m) return m[1] === "uk" ? "GB" : m[1].toUpperCase();
  const r = regions.filter((x) => !x.startsWith("us"));
  if (r.length === 1 && !regions.some((x) => x.startsWith("us"))) return r[0] === "uk" ? "GB" : r[0].toUpperCase();
  return "US";
}

/** One row per Odds API bookmaker. */
export function oddsApiRows(ev: OddsApiEvent, regions: string[]): BookRow[] {
  return ev.bookmakers.flatMap((bk) => {
    const row: BookRow = { book: bk.title, country: oddsApiCountry(bk.key, regions) };
    for (const m of bk.markets) {
      if (m.key === "h2h") {
        if (m.outcomes.some((o) => o.name === "Draw")) continue; // 3-way, not comparable
        const h = m.outcomes.find((o) => o.name === ev.home_team);
        const a = m.outcomes.find((o) => o.name === ev.away_team);
        if (h && a && twoWay(h.price, a.price)) row.ml = { away: a.price, home: h.price };
      } else if (m.key === "spreads") {
        const h = m.outcomes.find((o) => o.name === ev.home_team);
        const a = m.outcomes.find((o) => o.name === ev.away_team);
        if (h && a && h.point !== undefined && Math.abs(h.point) === 1.5 && twoWay(h.price, a.price)) row.pl = { homeLine: h.point, away: a.price, home: h.price };
      } else if (m.key === "totals") {
        const o = m.outcomes.find((x) => x.name === "Over");
        const u = m.outcomes.find((x) => x.name === "Under");
        if (o && u && o.point !== undefined && twoWay(o.price, u.price)) row.total = { line: o.point, over: o.price, under: u.price };
      }
    }
    return row.ml || row.pl || row.total ? [row] : [];
  });
}

/**
 * Merge rows from several sources: the same book in the same country keeps one row, each market
 * taken from the first source that has it. Sorted by country, then book.
 */
export function mergeRows(...sources: BookRow[][]): BookRow[] {
  const out = new Map<string, BookRow>();
  for (const row of sources.flat()) {
    const k = `${row.country}|${row.book.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const cur = out.get(k);
    if (!cur) out.set(k, { ...row });
    else {
      cur.ml ??= row.ml;
      cur.pl ??= row.pl;
      cur.total ??= row.total;
    }
  }
  const rows = [...out.values()];
  // A moneyline far from the other books' consensus is usually a stale or swapped price: drop it.
  const fairHome = (r: BookRow) => removeMargin([r.ml!.home, r.ml!.away])[0];
  const ml = rows.filter((r) => r.ml).map(fairHome).sort((a, b) => a - b);
  if (ml.length >= 3) {
    const median = ml[Math.floor(ml.length / 2)];
    for (const r of rows) if (r.ml && Math.abs(fairHome(r) - median) > 0.06) delete r.ml;
  }
  return rows
    .filter((r) => r.ml || r.pl || r.total)
    .sort((a, b) => (a.country === b.country ? a.book.localeCompare(b.book) : a.country.localeCompare(b.country)));
}

/** Best price on each side of each market, and the line it's for. Puck line and total only compare rows on the most common line. */
export function bestPrices(rows: BookRow[]) {
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
  const mode = (xs: number[]) => {
    const counts = new Map<number, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const plLine = mode(rows.flatMap((r) => (r.pl ? [r.pl.homeLine] : [])));
  const totalLine = mode(rows.flatMap((r) => (r.total ? [r.total.line] : [])));
  const pl = rows.flatMap((r) => (r.pl && r.pl.homeLine === plLine ? [r.pl] : []));
  const tot = rows.flatMap((r) => (r.total && r.total.line === totalLine ? [r.total] : []));
  return {
    mlAway: max(rows.flatMap((r) => (r.ml ? [r.ml.away] : []))),
    mlHome: max(rows.flatMap((r) => (r.ml ? [r.ml.home] : []))),
    plLine,
    plAway: max(pl.map((p) => p.away)),
    plHome: max(pl.map((p) => p.home)),
    totalLine,
    over: max(tot.map((t) => t.over)),
    under: max(tot.map((t) => t.under)),
  };
}

/** Margin-free consensus probability of the home side across rows (moneyline). */
export function consensusHome(rows: BookRow[]): number | null {
  const ml = rows.flatMap((r) => (r.ml ? [removeMargin([r.ml.home, r.ml.away])[0]] : []));
  return ml.length ? ml.reduce((s, x) => s + x, 0) / ml.length : null;
}

/** The book's margin on a two-way price, e.g. 0.045 for −110 / −110. */
export const margin = (a: number, b: number) => overround([a, b]);
