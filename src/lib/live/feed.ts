// Live scores for the online (GitHub Pages) copy. The NHL API can't be called from a browser (no
// CORS), so a GitHub Actions job (.github/workflows/live-scores.yml, scripts/live-scores.ts) copies
// the scoreboard once a minute to a `live-scores` branch, and pages read it from
// raw.githubusercontent.com, which allows cross-origin reads.
//
// raw.githubusercontent.com caches every path for 5 minutes and ignores query strings, so each
// minute gets its own file named after the UTC minute it was written; a browser asks for the
// newest minute and steps back until it finds one. A fresh name is never in the cache.
//
// Player stats: each minute file carries the goal list (scorer, assists, time) from the scoreboard,
// and a companion file per started game (`<minute>-<gameId>.json`) carries its player box, so the
// Tonight and Schedule pages don't download every box score each minute.
import type { BoxscoreResponse, BoxTeamStats, GameLandingResponse, GameState, LandingGoal, ScoreGame, ScoreGoal, ScoreResponse } from "@/lib/nhl/types";

export interface LiveGoal {
  period: number;
  periodType: string;
  time: string;
  team: string;
  playerId: number;
  name: string;
  /** Season total including this goal. */
  goalsToDate: number;
  assists: { playerId: number; name: string; assistsToDate: number }[];
  strength: string; // "ev" | "pp" | "sh"
  away: number;
  home: number;
}

export interface LiveSkater {
  playerId: number;
  name: string;
  position: string;
  goals: number;
  assists: number;
  points: number;
  sog: number;
  plusMinus: number;
  hits: number;
  toi: string;
}

export interface LiveGoalie {
  playerId: number;
  name: string;
  shotsAgainst: number;
  saves: number;
  savePctg: number | null;
  toi: string;
  starter: boolean;
  decision: string | null;
}

export interface LiveTeamBox {
  abbrev: string;
  sog: number;
  skaters: LiveSkater[];
  goalies: LiveGoalie[];
}

export interface LiveBox {
  id: number;
  at: string;
  away: LiveTeamBox;
  home: LiveTeamBox;
}

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
  /** Goals so far, in order. Missing in feeds written before player stats were added. */
  goals?: LiveGoal[];
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
    goals: (g.goals ?? []).map(goalOfScore),
  };
}

export function goalOfScore(g: ScoreGoal): LiveGoal {
  return {
    period: g.periodDescriptor?.number ?? g.period,
    periodType: g.periodDescriptor?.periodType ?? "REG",
    time: g.timeInPeriod,
    team: g.teamAbbrev,
    playerId: g.playerId,
    name: g.name.default,
    goalsToDate: g.goalsToDate,
    assists: g.assists.map((a) => ({ playerId: a.playerId, name: a.name.default, assistsToDate: a.assistsToDate })),
    strength: g.strength,
    away: g.awayScore,
    home: g.homeScore,
  };
}

/** Goals from a game's landing summary, in the same shape as the live feed's. */
export function goalsOfLanding(l: Pick<GameLandingResponse, "summary">): LiveGoal[] {
  return (l.summary?.scoring ?? []).flatMap((p) =>
    p.goals.map((g: LandingGoal) => ({
      period: p.periodDescriptor.number,
      periodType: p.periodDescriptor.periodType,
      time: g.timeInPeriod,
      team: g.teamAbbrev.default,
      playerId: g.playerId,
      name: g.name.default,
      goalsToDate: g.goalsToDate,
      assists: g.assists.map((a) => ({ playerId: a.playerId, name: a.name.default, assistsToDate: a.assistsToDate })),
      strength: g.strength,
      away: g.awayScore,
      home: g.homeScore,
    })),
  );
}

function teamBox(abbrev: string, sog: number, s: BoxTeamStats): LiveTeamBox {
  return {
    abbrev,
    sog,
    skaters: [...s.forwards, ...s.defense].map((p) => ({
      playerId: p.playerId, name: p.name.default, position: p.position, goals: p.goals, assists: p.assists, points: p.points,
      sog: p.sog, plusMinus: p.plusMinus, hits: p.hits, toi: p.toi,
    })),
    goalies: s.goalies.filter((g) => g.toi !== "00:00").map((g) => ({
      playerId: g.playerId, name: g.name.default, shotsAgainst: g.shotsAgainst, saves: g.saves, savePctg: g.savePctg ?? null,
      toi: g.toi, starter: g.starter, decision: g.decision ?? null,
    })),
  };
}

/** Player box of a started game, or null before the NHL has player stats for it. */
export function boxOf(b: BoxscoreResponse, at = new Date()): LiveBox | null {
  const s = b.playerByGameStats;
  if (!s) return null;
  return { id: b.id, at: at.toISOString(), away: teamBox(b.awayTeam.abbrev, b.awayTeam.sog, s.awayTeam), home: teamBox(b.homeTeam.abbrev, b.homeTeam.sog, s.homeTeam) };
}

/** Periods to list on a scoring sheet: every period played so far, plus any a goal was scored in. */
export function scoringPeriods(goals: LiveGoal[], current: { period: number | null; periodType: string | null }): { period: number; periodType: string }[] {
  const out = new Map<number, string>();
  const last = current.period ?? 0;
  for (let n = 1; n <= last; n++) out.set(n, n <= 3 ? "REG" : n === last && current.periodType ? current.periodType : "OT");
  for (const g of goals) out.set(g.period, g.periodType);
  return [...out].sort((a, b) => a[0] - b[0]).map(([period, periodType]) => ({ period, periodType }));
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

/** Player box published next to a minute file: 202610070131.json → 202610070131-2026020044.json. */
export function boxFile(minuteFile: string, gameId: number): string {
  return minuteFile.replace(/\.json$/, `-${gameId}.json`);
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
