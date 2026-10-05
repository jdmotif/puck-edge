import fs from "node:fs";
import path from "node:path";
import { sqlite } from "@/db";
import { parseEspn, parseNhl, parseRss, type NewsItem } from "./parse";
import { SOURCES, type NewsSource } from "./sources";

export type { NewsItem } from "./parse";

export { SOURCES, type NewsSource } from "./sources";

const TTL = 15 * 60_000;

export interface SourceResult {
  source: NewsSource;
  items: NewsItem[];
  fetchedAt: number; // 0 = never loaded
  stale: boolean; // live request failed; items (if any) are the last good copy
  error?: string;
}

export interface NewsFeed {
  items: NewsItem[];
  sources: SourceResult[];
}

function parse(source: NewsSource, text: string): NewsItem[] {
  if (source.format === "rss") return parseRss(source.id, text);
  const body = JSON.parse(text);
  return source.format === "espn" ? parseEspn(source.id, body) : parseNhl(source.id, body);
}

async function download(source: NewsSource): Promise<string> {
  if (process.env.NHL_OFFLINE === "fixtures") {
    const file = path.join(process.cwd(), "fixtures", `news_${source.id}.${source.format === "rss" ? "xml" : "json"}`);
    if (!fs.existsSync(file)) throw new Error(`No fixture for ${source.name}`);
    return fs.readFileSync(file, "utf8");
  }
  const res = await fetch(source.url, {
    redirect: "follow",
    headers: {
      accept: source.format === "rss" ? "application/rss+xml, application/xml, text/xml" : "application/json",
      "user-agent": "Mozilla/5.0 (compatible; puck-edge/0.1)",
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${source.name} answered ${res.status}`);
  return res.text();
}

const inflight = new Map<string, Promise<SourceResult>>();

/** One source, cached in api_cache for 15 minutes; on failure the last good copy comes back marked stale. */
export function loadSource(source: NewsSource, opts: { force?: boolean } = {}): Promise<SourceResult> {
  const key = `news:${source.id}`;
  const row = sqlite.prepare("SELECT body, fetched_at, expires_at FROM api_cache WHERE key = ?").get(key) as
    | { body: string; fetched_at: number; expires_at: number | null }
    | undefined;
  if (row && !opts.force && row.expires_at !== null && row.expires_at > Date.now()) {
    return Promise.resolve({ source, items: JSON.parse(row.body), fetchedAt: row.fetched_at, stale: false });
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async (): Promise<SourceResult> => {
    try {
      const items = parse(source, await download(source));
      // A feed that answers but yields nothing usable has probably changed format; keep the old copy.
      if (!items.length) throw new Error(`${source.name} returned no articles`);
      const fetchedAt = Date.now();
      sqlite
        .prepare(
          "INSERT INTO api_cache (key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at",
        )
        .run(key, JSON.stringify(items), fetchedAt, fetchedAt + TTL);
      return { source, items, fetchedAt, stale: false };
    } catch (e) {
      const error =
        e instanceof Error
          ? e.name === "TimeoutError"
            ? `${source.name} timed out`
            : e.message === "fetch failed" // network-level failure (offline, DNS, blocked host)
              ? `${source.name} couldn't be reached`
              : e.message
          : String(e);
      if (row) return { source, items: JSON.parse(row.body), fetchedAt: row.fetched_at, stale: true, error };
      return { source, items: [], fetchedAt: 0, stale: true, error };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every source merged, newest first, with the same story from two outlets shown once. */
export async function latestNews(opts: { team?: string; source?: string; limit?: number } = {}): Promise<NewsFeed> {
  const sources = await Promise.all(SOURCES.map((s) => loadSource(s)));
  const seen = new Set<string>();
  const items = sources
    .flatMap((r) => r.items)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((i) => {
      const k = normTitle(i.title);
      if (seen.has(i.url) || seen.has(k)) return false;
      seen.add(i.url).add(k);
      return true;
    })
    .filter((i) => (!opts.source || i.source === opts.source) && (!opts.team || i.teams.includes(opts.team)));
  return { items: items.slice(0, opts.limit ?? 100), sources };
}
