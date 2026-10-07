// Live scores for the online (GitHub Pages) copy. The NHL API can't be called from a browser (no
// CORS), so a GitHub Actions job (.github/workflows/live-scores.yml, scripts/live-scores.ts) copies
// the scoreboard once a minute to a `live-scores` branch, and pages read it from
// raw.githubusercontent.com, which allows cross-origin reads.
//
// raw.githubusercontent.com caches every path for 5 minutes and ignores query strings, so each
// minute gets its own file named after the UTC minute it was written; a browser asks for the
// newest minute and steps back until it finds one. A fresh name is never in the cache.
import type { GameState, ScoreGame, ScoreResponse } from "@/lib/nhl/types";

export interface LiveGame {
  id: number;
  state: GameState;
  away: number | null;
  home: number | null;
  /** Period number and type (REG, OT, SO), when the game has started. */
  period: number | null;
  periodType: string | null;
  clock: string | null;
  intermission: boolean;
  lastPeriodType: string | null;
}

export interface LiveFeed {
  at: string; // ISO time the scoreboard was read
  games: LiveGame[];
}

export const LIVE_STATES = new Set<string>(["LIVE", "CRIT"]);
export const DONE_STATES = new Set<string>(["OFF", "FINAL"]);
export const started = (state: string) => LIVE_STATES.has(state) || DONE_STATES.has(state);

export function liveGameOf(g: ScoreGame): LiveGame {
  return {
    id: g.id,
    state: g.gameState,
    away: g.awayTeam.score ?? null,
    home: g.homeTeam.score ?? null,
    period: g.periodDescriptor?.number ?? null,
    periodType: g.periodDescriptor?.periodType ?? null,
    clock: g.clock?.timeRemaining ?? null,
    intermission: g.clock?.inIntermission ?? false,
    lastPeriodType: g.gameOutcome?.lastPeriodType ?? null,
  };
}

export function feedOf(responses: (ScoreResponse | null)[], at = new Date()): LiveFeed {
  const byId = new Map<number, LiveGame>();
  for (const r of responses) for (const g of r?.games ?? []) byId.set(g.id, liveGameOf(g));
  return { at: at.toISOString(), games: [...byId.values()] };
}

/** File name for the minute `d` falls in, e.g. 202610070131.json (UTC). */
export function feedFile(d: Date): string {
  return d.toISOString().slice(0, 16).replace(/[-T:]/g, "") + ".json";
}

interface StatusText {
  final: (lastPeriodType?: string) => string;
  period: (n: number, type: string) => string;
  intermission: (period: string) => string;
}

/** Same status line the Tonight cards show: "P2 12:34", "P1 INT", "Final/OT". */
export function liveStatus(g: LiveGame, s: StatusText): string {
  if (DONE_STATES.has(g.state)) return s.final(g.lastPeriodType ?? undefined);
  const period = g.period !== null && g.periodType ? s.period(g.period, g.periodType) : "";
  if (g.intermission) return s.intermission(period);
  return `${period} ${g.clock ?? ""}`.trim();
}
