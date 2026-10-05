// Official and projected lineups for a day's games.
//
// What the NHL API actually publishes (checked 2026-10-05):
// - Before game day: nothing lineup-specific.
// - On game day, hours before puck drop: play-by-play `rosterSpots` lists each team's active roster (23 players),
//   so injured/reserve players drop out, but it doesn't say who dresses or who starts in net.
// - About 20-25 minutes before puck drop: `rosterSpots` shrinks to the 20 who dressed (18 skaters, 2 goalies).
//   The skaters are then confirmed; the starting goalie still isn't.
// - Once the game starts: the box score marks the starting goalie (`starter: true`).
// - Line combinations are never published. We order lines and pairs by recent ice time.
import { sqlite } from "@/db";
import { api, todayIso, type Fetched } from "@/lib/nhl/client";
import { daysBetween } from "@/lib/model/features";
import type { BoxscoreResponse, BoxTeamStats, GameState, PlayByPlayResponse, RosterResponse, ScheduleGame } from "@/lib/nhl/types";
import { toiToSec } from "@/lib/data/ingest";

const STARTED = new Set<GameState>(["LIVE", "CRIT", "OFF", "FINAL"]);
const DONE = new Set<GameState>(["OFF", "FINAL"]);
const SKATER_WINDOW = 5; // team games used to pick the dressed skaters and their ice time
const GOALIE_WINDOW = 10; // team games used to pick the starter

export interface RosterEntry {
  id: number;
  name: string;
  number?: number;
  pos: string; // C | L | R | D | G
}

/** One team game's box score lines, newest first. */
export interface HistoryGame {
  gameId: number;
  date: string;
  players: { id: number; name: string; pos: string; toiSec: number; starter: boolean | null }[];
}

export interface LineupPlayer extends RosterEntry {
  toiSec: number | null; // average over the games used, or this game's when official
  gp: number; // games played in the window
}

export interface GoaliePick extends LineupPlayer {
  starts: number;
  lastStart: string | null;
}

export interface TeamLineup {
  team: string;
  status: "official" | "projected";
  forwards: LineupPlayer[][]; // 4 lines, [LW, C, RW]
  defense: LineupPlayer[][]; // 3 pairs
  goalie: GoaliePick | null;
  backup: GoaliePick | null;
  goalieNote: string;
  extras: LineupPlayer[]; // on the active roster but not projected to dress
  gamesUsed: number;
  // dressed-pregame: the NHL has posted the 20 who dressed, so skaters are confirmed but the goalie is still projected
  rosterSource: "game-day" | "team-roster" | "dressed-pregame" | "dressed";
}

const isFwd = (pos: string) => pos === "C" || pos === "L" || pos === "R";

function summarize(history: HistoryGame[], window: number) {
  const games = history.slice(0, window);
  const by = new Map<number, { toi: number; gp: number; weight: number; starts: number; lastStart: string | null; name: string; pos: string }>();
  games.forEach((g, i) => {
    const w = 1 - i * 0.15; // most recent game counts most
    for (const p of g.players) {
      const s = by.get(p.id) ?? { toi: 0, gp: 0, weight: 0, starts: 0, lastStart: null, name: p.name, pos: p.pos };
      s.toi += p.toiSec;
      s.gp += 1;
      s.weight += w;
      if (p.starter) {
        s.starts += 1;
        s.lastStart ??= g.date;
      }
      by.set(p.id, s);
    }
  });
  return { games, by };
}

/** Arrange 12 forwards into lines by ice time: the four highest-TOI centres anchor lines 1-4, wingers pair off in TOI order. */
export function buildLines(forwards: LineupPlayer[]): LineupPlayer[][] {
  const byToi = [...forwards].sort((a, b) => (b.toiSec ?? 0) - (a.toiSec ?? 0));
  const centres = byToi.filter((p) => p.pos === "C").slice(0, 4);
  for (const p of byToi) if (centres.length < 4 && !centres.includes(p)) centres.push(p);
  centres.sort((a, b) => (b.toiSec ?? 0) - (a.toiSec ?? 0));
  const wings = byToi.filter((p) => !centres.includes(p));
  const lines: LineupPlayer[][] = [];
  for (let i = 0; i < centres.length; i++) {
    let [lw, rw] = [wings[2 * i], wings[2 * i + 1]];
    // Put a listed left wing on the left and a right wing on the right when that fits better.
    const fit = (l?: LineupPlayer, r?: LineupPlayer) => (l?.pos === "L" ? 1 : l?.pos === "R" ? -1 : 0) + (r?.pos === "R" ? 1 : r?.pos === "L" ? -1 : 0);
    if (fit(rw, lw) > fit(lw, rw)) [lw, rw] = [rw, lw];
    lines.push([lw, centres[i], rw].filter(Boolean) as LineupPlayer[]);
  }
  return lines;
}

export function buildPairs(defense: LineupPlayer[]): LineupPlayer[][] {
  const byToi = [...defense].sort((a, b) => (b.toiSec ?? 0) - (a.toiSec ?? 0));
  const pairs: LineupPlayer[][] = [];
  for (let i = 0; i < byToi.length; i += 2) pairs.push(byToi.slice(i, i + 2));
  return pairs;
}

/**
 * Projected lineup from the team's recent games, limited to the active roster.
 * Skaters who dressed recently (weighted toward the last game) make it; lines follow average ice time.
 */
export function projectLineup(input: {
  team: string;
  gameDate: string;
  roster: RosterEntry[];
  history: HistoryGame[]; // newest first, before gameDate
  rosterSource: TeamLineup["rosterSource"];
}): TeamLineup {
  const { team, gameDate, roster, history, rosterSource } = input;
  const sk = summarize(history, SKATER_WINDOW);
  const gl = summarize(history, GOALIE_WINDOW);
  const onRoster = roster.length ? new Map(roster.map((r) => [r.id, r])) : null;

  // Everyone eligible: roster players, plus recent players when we have no roster to check against.
  const pool = new Map<number, RosterEntry>();
  if (onRoster) for (const r of roster) pool.set(r.id, r);
  else for (const [id, s] of sk.by) pool.set(id, { id, name: s.name, pos: s.pos });

  const player = (r: RosterEntry, by: typeof sk.by): LineupPlayer => {
    const s = by.get(r.id);
    return { ...r, toiSec: s && s.gp ? s.toi / s.gp : null, gp: s?.gp ?? 0 };
  };
  const dressScore = (id: number) => {
    const s = sk.by.get(id);
    return s ? s.weight * 1000 + s.toi / Math.max(1, s.gp) / 60 : 0;
  };
  const pickTop = (pred: (pos: string) => boolean, n: number) =>
    [...pool.values()]
      .filter((r) => pred(r.pos))
      .sort((a, b) => dressScore(b.id) - dressScore(a.id))
      .map((r) => player(r, sk.by))
      .slice(0, n);

  // A posted dressed list can be 11 F / 7 D, so keep everyone on it.
  const all = rosterSource === "dressed-pregame";
  const fwds = pickTop(isFwd, all ? Infinity : 12);
  const dmen = pickTop((p) => p === "D", all ? Infinity : 6);
  const dressed = new Set([...fwds, ...dmen].map((p) => p.id));
  const extras = [...pool.values()].filter((r) => r.pos !== "G" && !dressed.has(r.id)).map((r) => player(r, sk.by));

  // Goalie: most starts in the last 10; the other one when the starter also started yesterday.
  const goalies = [...pool.values()]
    .filter((r) => r.pos === "G")
    .map((r): GoaliePick => {
      const s = gl.by.get(r.id);
      return { ...player(r, gl.by), starts: s?.starts ?? 0, lastStart: s?.lastStart ?? null };
    })
    .sort((a, b) => b.starts - a.starts || (b.lastStart ?? "").localeCompare(a.lastStart ?? ""));
  let [goalie, backup] = [goalies[0] ?? null, goalies[1] ?? null];
  const window = Math.min(GOALIE_WINDOW, gl.games.length);
  let goalieNote: string;
  if (!goalie) goalieNote = "No goalie data";
  else if (backup && goalie.lastStart && daysBetween(goalie.lastStart, gameDate) === 1) {
    goalieNote = `Back-to-back: ${goalie.name} started yesterday, so ${backup.name} is likelier`;
    [goalie, backup] = [backup, goalie];
  } else if (!window) goalieNote = "No games played yet";
  else goalieNote = `${goalie.starts} of the last ${window} starts`;

  return {
    team,
    status: "projected",
    forwards: buildLines(fwds),
    defense: buildPairs(dmen),
    goalie,
    backup,
    goalieNote,
    extras: extras.sort((a, b) => dressScore(b.id) - dressScore(a.id)),
    gamesUsed: sk.games.length,
    rosterSource,
  };
}

/** Official lineup once the game has started: the dressed 20 and the starting goalie from the box score. */
export function officialLineup(input: { team: string; stats: BoxTeamStats; history: HistoryGame[]; final: boolean }): TeamLineup {
  const { team, stats, history, final } = input;
  const sk = summarize(history, SKATER_WINDOW);
  // Finished games are ordered by that night's ice time; live ones by recent ice time so lines don't reshuffle every shift.
  const toi = (id: number, gameToi: string) => {
    const s = sk.by.get(id);
    return final || !s ? toiToSec(gameToi) : s.toi / s.gp;
  };
  const mk = (p: BoxTeamStats["forwards"][number]): LineupPlayer => ({
    id: p.playerId,
    name: p.name.default,
    number: p.sweaterNumber,
    pos: p.position,
    toiSec: toi(p.playerId, p.toi),
    gp: sk.by.get(p.playerId)?.gp ?? 0,
  });
  const goalies = stats.goalies.map(
    (g): GoaliePick => ({ id: g.playerId, name: g.name.default, number: g.sweaterNumber, pos: "G", toiSec: toiToSec(g.toi), gp: 0, starts: 0, lastStart: null }),
  );
  // `starter` is only filled in once the game is final; while it's live, the goalie with ice time started.
  const starterId =
    stats.goalies.find((g) => g.starter)?.playerId ?? [...stats.goalies].filter((g) => toiToSec(g.toi) > 0).sort((a, b) => toiToSec(b.toi) - toiToSec(a.toi))[0]?.playerId;
  const goalie = goalies.find((g) => g.id === starterId) ?? goalies[0] ?? null;
  return {
    team,
    status: "official",
    forwards: buildLines(stats.forwards.map(mk)),
    defense: buildPairs(stats.defense.map(mk)),
    goalie,
    backup: goalies.find((g) => g !== goalie) ?? null,
    goalieNote: "Confirmed starter",
    extras: [],
    gamesUsed: sk.games.length,
    rosterSource: "dressed",
  };
}

// ---------- loading ----------

/** The team's most recent stored games before `date`, newest first. */
export function teamHistory(team: string, date: string, limit = GOALIE_WINDOW): HistoryGame[] {
  const ids = sqlite
    .prepare("SELECT id, date FROM games WHERE (home = ? OR away = ?) AND date < ? ORDER BY date DESC, id DESC LIMIT ?")
    .all(team, team, date, limit) as { id: number; date: string }[];
  if (!ids.length) return [];
  const rows = sqlite
    .prepare(`SELECT game_id, player_id, name, position, toi_sec, starter FROM player_games WHERE team = ? AND game_id IN (${ids.map(() => "?").join(",")})`)
    .all(team, ...ids.map((g) => g.id)) as { game_id: number; player_id: number; name: string; position: string; toi_sec: number; starter: number | null }[];
  return ids.map((g) => ({
    gameId: g.id,
    date: g.date,
    players: rows
      .filter((r) => r.game_id === g.id)
      .map((r) => ({ id: r.player_id, name: r.name, pos: r.position, toiSec: r.toi_sec, starter: r.starter === null ? null : r.starter === 1 })),
  }));
}

const fullName = (f: { default: string }, l: { default: string }) => `${f.default.charAt(0)}. ${l.default}`;

function rosterFromSpots(pbp: PlayByPlayResponse | null, teamId: number): RosterEntry[] {
  return (pbp?.rosterSpots ?? [])
    .filter((s) => s.teamId === teamId)
    .map((s) => ({ id: s.playerId, name: fullName(s.firstName, s.lastName), number: s.sweaterNumber, pos: s.positionCode }));
}

function rosterFromClub(r: RosterResponse | null): RosterEntry[] {
  if (!r) return [];
  return [...r.forwards, ...r.defensemen, ...r.goalies].map((p) => ({
    id: p.id,
    name: fullName(p.firstName, p.lastName),
    number: p.sweaterNumber,
    pos: p.positionCode,
  }));
}

/** A game-day roster of at most 18 skaters is the dressed list, not the 23-man active roster. */
export function isDressedList(roster: RosterEntry[]): boolean {
  const skaters = roster.filter((r) => r.pos !== "G").length;
  return skaters > 0 && skaters <= 18;
}

export interface GameLineups {
  game: ScheduleGame;
  away: TeamLineup;
  home: TeamLineup;
}

export async function loadLineups(date = todayIso()) {
  const schedule = await api.schedule(date);
  const games = (schedule.data?.gameWeek.find((d) => d.date === date)?.games ?? []).filter((g) => [1, 2, 3].includes(g.gameType));
  const fetched: Fetched<unknown>[] = [schedule];

  const result: GameLineups[] = await Promise.all(
    games.map(async (g) => {
      // The game feed's state is fresher than the schedule's.
      const pbp = await api.playByPlay(g.id);
      fetched.push(pbp);
      const state = pbp.data?.gameState ?? g.gameState;
      const box = STARTED.has(state) ? await api.boxscore(g.id) : null;
      const stats = (box?.data as BoxscoreResponse | null)?.playerByGameStats;
      const side = async (key: "awayTeam" | "homeTeam"): Promise<TeamLineup> => {
        const t = g[key];
        const history = teamHistory(t.abbrev, g.gameDate ?? date);
        if (stats) return officialLineup({ team: t.abbrev, stats: stats[key], history, final: DONE.has(state) });
        let roster = rosterFromSpots(pbp.data, t.id);
        let rosterSource: TeamLineup["rosterSource"] = isDressedList(roster) ? "dressed-pregame" : "game-day";
        if (!roster.length) {
          roster = rosterFromClub((await api.roster(t.abbrev)).data);
          rosterSource = "team-roster";
        }
        return projectLineup({ team: t.abbrev, gameDate: g.gameDate ?? date, roster, history, rosterSource });
      };
      const [away, home] = await Promise.all([side("awayTeam"), side("homeTeam")]);
      return { game: g, away, home };
    }),
  );
  return { date, games: result, fetched };
}
