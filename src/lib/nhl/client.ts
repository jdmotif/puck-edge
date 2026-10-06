import fs from "node:fs";
import path from "node:path";
import { sqlite } from "@/db";
import type {
  BoxscoreResponse,
  ClubScheduleResponse,
  ClubStatsResponse,
  GameLandingResponse,
  LeadersResponse,
  PartnerGameResponse,
  PlayByPlayResponse,
  PlayerGameLogResponse,
  PlayerLanding,
  RosterResponse,
  ScheduleResponse,
  ScoreResponse,
  StandingsResponse,
} from "./types";

const BASE = "https://api-web.nhle.com/v1/";
const MIN = 60_000;
const TTL = {
  standard: 15 * MIN, // schedules, standings, stats
  live: 30_000, // any game in progress
  forever: null as number | null, // finished games
};

export interface Fetched<T> {
  data: T;
  fetchedAt: number; // epoch ms of the copy being shown
  stale: boolean; // true when the live request failed and this is an older copy
  error?: string;
}

export class NhlApiError extends Error {}

const LIVE_STATES = new Set(["LIVE", "CRIT"]);
const DONE_STATES = new Set(["OFF", "FINAL"]);

// How long a response stays fresh depends on what's in it.
function ttlFor(apiPath: string, body: unknown): number | null {
  const b = body as Record<string, unknown>;
  if (apiPath.startsWith("gamecenter/")) {
    const state = String(b?.gameState ?? "");
    // PRE covers the last half hour before puck drop, when the dressed roster appears.
    if (LIVE_STATES.has(state) || state === "PRE") return TTL.live;
    if (DONE_STATES.has(state)) return TTL.forever;
    const start = Date.parse(String(b?.startTimeUTC ?? ""));
    if (start - Date.now() < 60 * MIN) return 2 * MIN; // close to puck drop
    return TTL.standard;
  }
  if (apiPath.startsWith("score/")) {
    const games = (b?.games as { gameState: string }[]) ?? [];
    if (games.some((g) => LIVE_STATES.has(g.gameState))) return TTL.live;
    const isPastDate = !apiPath.includes("now") && apiPath.slice(6, 16) < todayIso();
    if (isPastDate && games.length > 0 && games.every((g) => DONE_STATES.has(g.gameState))) return TTL.forever;
    return TTL.standard;
  }
  if (apiPath.startsWith("schedule/")) {
    const days = (b?.gameWeek as { games?: { gameState: string }[] }[]) ?? [];
    if (days.some((d) => d.games?.some((g) => LIVE_STATES.has(g.gameState)))) return TTL.live;
  }
  return TTL.standard;
}

export function todayIso(d = new Date()): string {
  // Local calendar date of the machine running the app.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const getStmt = () => sqlite.prepare("SELECT body, fetched_at, expires_at FROM api_cache WHERE key = ?");
const putStmt = () =>
  sqlite.prepare(
    "INSERT INTO api_cache (key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at",
  );

const inflight = new Map<string, Promise<Fetched<unknown>>>();

function fixturePath(apiPath: string): string {
  const name = apiPath.replace(/\?.*$/, "").replace(/\//g, "_") + ".json";
  return path.join(process.cwd(), "fixtures", name);
}

async function fetchJson(apiPath: string): Promise<unknown> {
  if (process.env.NHL_OFFLINE === "fixtures") {
    const file = fixturePath(apiPath);
    if (!fs.existsSync(file)) throw new NhlApiError(`No fixture for ${apiPath}`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const res = await fetch(BASE + apiPath, {
    redirect: "follow", // the /now endpoints answer with a 307
    headers: { accept: "application/json", "user-agent": "puck-edge/0.1" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new NhlApiError(`NHL API ${res.status} for ${apiPath}`);
  return res.json();
}

/**
 * Fetch an NHL API path with a SQLite-backed cache.
 * Fresh cache → returned as-is. Expired → refetch; if that fails, the old copy comes back marked stale.
 */
export async function nhl<T>(apiPath: string, opts: { force?: boolean } = {}): Promise<Fetched<T>> {
  const now = Date.now();
  const row = getStmt().get(apiPath) as { body: string; fetched_at: number; expires_at: number | null } | undefined;
  if (row && !opts.force && (row.expires_at === null || row.expires_at > now)) {
    return { data: JSON.parse(row.body) as T, fetchedAt: row.fetched_at, stale: false };
  }

  const pending = inflight.get(apiPath);
  if (pending) return pending as Promise<Fetched<T>>;

  const p = (async (): Promise<Fetched<T>> => {
    try {
      const body = await fetchJson(apiPath);
      const ttl = ttlFor(apiPath, body);
      const fetchedAt = Date.now();
      putStmt().run(apiPath, JSON.stringify(body), fetchedAt, ttl === null ? null : fetchedAt + ttl);
      return { data: body as T, fetchedAt, stale: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (row) return { data: JSON.parse(row.body) as T, fetchedAt: row.fetched_at, stale: true, error: msg };
      throw new NhlApiError(msg);
    } finally {
      inflight.delete(apiPath);
    }
  })();
  inflight.set(apiPath, p as Promise<Fetched<unknown>>);
  return p;
}

/** Same as nhl() but never throws: returns null data with the error instead. */
export async function nhlSafe<T>(apiPath: string): Promise<Fetched<T | null>> {
  try {
    return await nhl<T>(apiPath);
  } catch (e) {
    return { data: null, fetchedAt: 0, stale: true, error: e instanceof Error ? e.message : String(e) };
  }
}

export const api = {
  schedule: (date: string | "now") => nhlSafe<ScheduleResponse>(`schedule/${date}`),
  score: (date: string | "now") => nhlSafe<ScoreResponse>(`score/${date}`),
  standings: (date: string | "now" = "now") => nhlSafe<StandingsResponse>(`standings/${date}`),
  skaterLeaders: (categories = "points,goals,assists", limit = 50) =>
    nhlSafe<LeadersResponse>(`skater-stats-leaders/current?categories=${categories}&limit=${limit}`),
  goalieLeaders: (categories = "wins,savePctg,goalsAgainstAverage", limit = 50) =>
    nhlSafe<LeadersResponse>(`goalie-stats-leaders/current?categories=${categories}&limit=${limit}`),
  clubStats: (team: string) => nhlSafe<ClubStatsResponse>(`club-stats/${team}/now`),
  roster: (team: string) => nhlSafe<RosterResponse>(`roster/${team}/current`),
  clubSchedule: (team: string, season: number | "now" = "now") =>
    nhlSafe<ClubScheduleResponse>(`club-schedule-season/${team}/${season}`),
  player: (id: number) => nhlSafe<PlayerLanding>(`player/${id}/landing`),
  gameLog: (id: number, season: number, gameType = 2) =>
    nhlSafe<PlayerGameLogResponse>(`player/${id}/game-log/${season}/${gameType}`),
  boxscore: (id: number) => nhlSafe<BoxscoreResponse>(`gamecenter/${id}/boxscore`),
  landing: (id: number) => nhlSafe<GameLandingResponse>(`gamecenter/${id}/landing`),
  playByPlay: (id: number) => nhlSafe<PlayByPlayResponse>(`gamecenter/${id}/play-by-play`),
  partnerOdds: (country: string) => nhlSafe<PartnerGameResponse>(`partner-game/${country}/now`),
};

/** Season id like 20262027 for a date (seasons roll over in September). */
export function seasonFor(date: string): number {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 9 ? y : y - 1;
  return start * 10000 + start + 1;
}
