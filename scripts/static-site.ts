// Builds the static copy of Puck Edge for GitHub Pages into ./out.  Run with `npm run build:static`
// after `npm run sync`.
//
// GitHub Pages can't run the Next.js server or SQLite, so this renders the real app once with the
// current data: it builds with a base path, starts `next start`, follows the app's own links from
// every menu page (English and French), saves each page as a file and copies the JS/CSS next to
// them. Views reached through a query string are saved as folders (see src/lib/static/paths.ts).
// Bets and settings move to the browser; final scores for recent games are written as small JSON
// files so the browser can settle bets.
//
// Options: --skip-build (reuse the last static build), PORT, NEXT_PUBLIC_BASE_PATH (default /puck-edge).
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { api, seasonFor, todayIso } from "@/lib/nhl/client";
import { toStaticHref } from "@/lib/static/paths";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { sqlite } from "@/db";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "/puck-edge";
const PORT = Number(process.env.PORT) || 3456;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("out");
const DIST = ".next-static";
const CONCURRENCY = 6;
const NEXT_BIN = path.resolve("node_modules/next/dist/bin/next");
const env = { ...process.env, NEXT_PUBLIC_STATIC_SITE: "1", NEXT_PUBLIC_BASE_PATH: BASE, NEXT_TELEMETRY_DISABLED: "1" };

const MENU = ["/", "/lineups", "/schedule", "/results", "/standings", "/leaders", "/news", "/model", "/bets", "/settings"];
// The News and Results team filters are dropdowns, not links, so their pages are listed here.
const TEAMS = "ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH".split(" ");

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// ---- What gets published ---------------------------------------------------------------------

function makeRules(today: string, gameIds: Set<number>) {
  const near = (v: string, lo: number, hi: number) => isDate(v) && v >= addDays(today, lo) && v <= addDays(today, hi);
  const only = (p: URLSearchParams, keys: string[]) => [...p.keys()].every((k) => keys.includes(k));
  return (route: string, p: URLSearchParams): boolean => {
    const none = [...p.keys()].length === 0;
    const m = route.match(/^\/(game|players|teams)\/([^/]+)$/);
    if (m) {
      if (!none) return false; // head-to-head (?vs) and other seasons stay local-only
      if (m[1] === "game") return gameIds.has(Number(m[2]));
      return m[1] === "players" ? /^\d+$/.test(m[2]) : /^[A-Z]{3}$/.test(m[2]);
    }
    switch (route) {
      case "/":
        return only(p, ["date"]) && (!p.has("date") || near(p.get("date")!, -7, 7));
      case "/lineups":
        return only(p, ["date", "show"]) && (!p.has("date") || near(p.get("date")!, -3, 7)) && ["all", "official", "projected", null].includes(p.get("show"));
      case "/schedule":
        return only(p, ["view", "date"]) && (!p.has("date") || near(p.get("date")!, -40, 120));
      case "/results":
        return only(p, ["page", "team"]) && (!p.has("page") || /^\d{1,2}$/.test(p.get("page")!)) && (!p.has("team") || /^[A-Z]{3}$/.test(p.get("team")!));
      case "/standings":
        return only(p, ["view"]);
      case "/leaders":
        return only(p, ["tab"]);
      case "/news":
        return [...p.keys()].length <= 1 && only(p, ["team", "source"]);
      case "/model":
      case "/settings":
      case "/bets":
        return none;
      default:
        return false;
    }
  };
}

/** Games that get a page: everything played this season, plus the coming week's previews. */
async function publishedGames(today: string): Promise<Set<number>> {
  const season = seasonFor(today);
  const ids = new Set((sqlite.prepare("SELECT id FROM games WHERE season = ?").all(season) as { id: number }[]).map((r) => r.id));
  for (const d of [addDays(today, -7), today, addDays(today, 7)]) {
    const r = await api.schedule(d);
    for (const day of r.data?.gameWeek ?? []) {
      if (day.date < addDays(today, -7) || day.date > addDays(today, 7)) continue;
      for (const g of day.games) ids.add(g.id);
    }
  }
  return ids;
}

// ---- Server --------------------------------------------------------------------------------------

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [NEXT_BIN, ...args], { env, stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`next ${args[0]} exited with ${code}`))));
  });
}

async function startServer(): Promise<ChildProcess> {
  const p = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: ["ignore", "inherit", "inherit"] });
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${ORIGIN}${BASE}/settings`);
      if (r.ok) return p;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error("next start didn't come up");
}

async function get(url: string, fr: boolean): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(url, { headers: { cookie: `${LOCALE_COOKIE}=${fr ? "fr" : "en"}` }, redirect: "manual", signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// ---- Pages -----------------------------------------------------------------------------------------

/** App-relative link → canonical form (route + sorted non-empty query), or null for external links. */
function canonical(href: string): { route: string; params: URLSearchParams; key: string } | null {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/_next") || href === BASE || href.startsWith(BASE + "/")) return null;
  const u = new URL(href, "http://x");
  let route = u.pathname;
  if (route.length > 1 && route.endsWith("/")) route = route.slice(0, -1);
  const params = new URLSearchParams([...u.searchParams].filter(([, v]) => v !== "").sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { route, params, key: route + (params.size ? `?${params}` : "") };
}

const fileFor = (staticHref: string) =>
  path.join(OUT, ...staticHref.slice(BASE.length).split("/").filter(Boolean).map(decodeURIComponent), "index.html");

const decode = (s: string) => s.replace(/&amp;/g, "&");
const encode = (s: string) => s.replace(/&/g, "&amp;");

/** Points the app's links (and GET forms) at the saved folders. */
function rewrite(html: string, fr: boolean): string {
  return html.replace(/(href|action)="([^"]*)"/g, (all, attr: string, raw: string) => {
    const v = decode(raw);
    if (!canonical(v)) return all;
    return `${attr}="${encode(toStaticHref(v, BASE, fr))}"`;
  });
}

const links = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => decode(m[1]));

async function crawl(allow: ReturnType<typeof makeRules>) {
  const seen = new Set<string>();
  const queue: { key: string; fr: boolean }[] = [];
  const failures: string[] = [];
  let saved = 0;
  let bytes = 0;
  const enqueue = (href: string, fr: boolean) => {
    const c = canonical(href);
    if (!c || !allow(c.route, c.params)) return;
    const id = `${fr ? "fr" : "en"} ${c.key}`;
    if (seen.has(id)) return;
    seen.add(id);
    queue.push({ key: c.key, fr });
  };
  for (const fr of [false, true]) for (const m of [...MENU, ...TEAMS.flatMap((t) => [`/news?team=${t}`, `/results?team=${t}`])]) enqueue(m, fr);

  const worker = async () => {
    while (queue.length) {
      const { key, fr } = queue.shift()!;
      const q = key.indexOf("?");
      const route = q >= 0 ? key.slice(0, q) : key;
      const url = `${ORIGIN}${BASE}${route === "/" ? "" : route}${q >= 0 ? key.slice(q) : ""}`;
      try {
        const r = await get(url, fr);
        if (r.status !== 200) {
          failures.push(`${r.status} ${fr ? "fr" : "en"} ${key}`);
          continue;
        }
        const html = await r.text();
        for (const l of links(html)) enqueue(l, fr);
        const file = fileFor(toStaticHref(key, BASE, fr));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const out = rewrite(html, fr);
        fs.writeFileSync(file, out);
        saved++;
        bytes += out.length;
        if (saved % 100 === 0) console.log(`  ${saved} pages, ${queue.length} queued`);
      } catch (e) {
        failures.push(`ERR ${fr ? "fr" : "en"} ${key}: ${(e as Error).message}`);
      }
    }
  };
  // Workers stop when the queue is momentarily empty, so keep relaunching until it's drained.
  while (queue.length) await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { saved, bytes, failures, seen };
}

async function notFoundPages() {
  for (const fr of [false, true]) {
    const r = await get(`${ORIGIN}${BASE}/__not_found__`, fr);
    let html = rewrite(await r.text(), fr);
    // 404.html is served for every missing path; the flag stops the boot script from redirecting.
    if (!fr) html = html.replace(/<head[^>]*>/, (h) => `${h}<script>window.__pe404=1</script>`);
    const file = fr ? path.join(OUT, "fr", "404", "index.html") : path.join(OUT, "404.html");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  }
}

/** Final scores (each player's goals/points, and the closing odds) for recent games, so the browser can settle bets and show CLV. */
function writeFinals(today: string) {
  const games = sqlite
    .prepare("SELECT id, home, away, home_score AS homeScore, away_score AS awayScore FROM games WHERE date >= ?")
    .all(addDays(today, -60)) as { id: number; home: string; away: string; homeScore: number; awayScore: number }[];
  const players = sqlite.prepare("SELECT player_id AS id, goals, points FROM player_games WHERE game_id = ?");
  const closing = sqlite.prepare("SELECT odds FROM game_odds WHERE game_id = ?");
  const dir = path.join(OUT, "data", "game");
  fs.mkdirSync(dir, { recursive: true });
  for (const g of games) {
    const rows = players.all(g.id) as { id: number; goals: number; points: number }[];
    const odds = closing.get(g.id) as { odds: string } | undefined;
    const body = { ...g, players: Object.fromEntries(rows.map((p) => [p.id, [p.goals, p.points]])), closing: odds ? JSON.parse(odds.odds) : null };
    fs.writeFileSync(path.join(dir, `${g.id}.json`), JSON.stringify(body));
  }
  return games.length;
}

async function main() {
  const started = Date.now();
  if (!process.argv.includes("--skip-build")) await run(["build"]);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const server = await startServer();
  try {
    const today = todayIso();
    const allow = makeRules(today, await publishedGames(today));
    console.log(`Exporting static site for ${today} (base ${BASE})`);
    const { saved, bytes, failures, seen } = await crawl(allow);
    await notFoundPages();
    const icon = await fetch(`${ORIGIN}${BASE}/icon.svg`);
    if (icon.ok) fs.writeFileSync(path.join(OUT, "icon.svg"), Buffer.from(await icon.arrayBuffer()));
    const finals = writeFinals(today);
    fs.cpSync(path.join(DIST, "static"), path.join(OUT, "_next", "static"), { recursive: true });
    fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
    console.log(`Saved ${saved} pages (${(bytes / 1e6).toFixed(1)} MB) and ${finals} final scores in ${Math.round((Date.now() - started) / 1000)}s`);
    if (failures.length) console.warn(`${failures.length} pages failed:\n  ${failures.slice(0, 30).join("\n  ")}`);
    // Every menu page must exist in both languages, and almost everything else must have rendered.
    const menuMissing = MENU.flatMap((m) => [false, true].filter((fr) => !fs.existsSync(fileFor(toStaticHref(m, BASE, fr)))).map((fr) => `${fr ? "fr" : "en"} ${m}`));
    if (menuMissing.length) throw new Error(`Menu pages missing: ${menuMissing.join(", ")}`);
    if (failures.length > Math.max(10, seen.size * 0.05)) throw new Error("Too many pages failed to render");
  } finally {
    server.kill();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
