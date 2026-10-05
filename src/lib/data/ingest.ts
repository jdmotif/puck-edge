import { sqlite } from "@/db";
import { api, todayIso } from "@/lib/nhl/client";
import type { BoxscoreResponse, BoxTeamStats, GameLandingResponse } from "@/lib/nhl/types";

export const toiToSec = (toi: string | undefined) => {
  if (!toi) return 0;
  const [m, s] = toi.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
};

const DONE = new Set(["OFF", "FINAL"]);

const insertGame = () =>
  sqlite.prepare(`INSERT OR REPLACE INTO games
    (id, season, game_type, date, start_utc, away, home, away_score, home_score, away_sog, home_sog, last_period_type, away_goalie_id, home_goalie_id, venue)
    VALUES (@id, @season, @gameType, @date, @startUtc, @away, @home, @awayScore, @homeScore, @awaySog, @homeSog, @lastPeriodType, @awayGoalieId, @homeGoalieId, @venue)`);

const insertPlayer = () =>
  sqlite.prepare(`INSERT OR REPLACE INTO player_games
    (game_id, player_id, name, team, opponent, is_home, date, season, position, goals, assists, points, shots, pp_goals, toi_sec, shots_against, saves, goals_against, starter)
    VALUES (@gameId, @playerId, @name, @team, @opponent, @isHome, @date, @season, @position, @goals, @assists, @points, @shots, @ppGoals, @toiSec, @shotsAgainst, @saves, @goalsAgainst, @starter)`);

export function hasGame(id: number): boolean {
  return !!sqlite.prepare("SELECT 1 FROM games WHERE id = ?").get(id);
}

/** Store a finished game's box score. Returns false if the game isn't final yet. */
export function storeBoxscore(box: BoxscoreResponse): boolean {
  if (!DONE.has(box.gameState) || !box.playerByGameStats) return false;
  const stats = box.playerByGameStats;
  const starter = (t: BoxTeamStats) =>
    t.goalies.find((g) => g.starter)?.playerId ?? [...t.goalies].sort((a, b) => toiToSec(b.toi) - toiToSec(a.toi))[0]?.playerId ?? null;

  const tx = sqlite.transaction(() => {
    insertGame().run({
      id: box.id,
      season: box.season,
      gameType: box.gameType,
      date: box.gameDate,
      startUtc: box.startTimeUTC,
      away: box.awayTeam.abbrev,
      home: box.homeTeam.abbrev,
      awayScore: box.awayTeam.score,
      homeScore: box.homeTeam.score,
      awaySog: box.awayTeam.sog ?? 0,
      homeSog: box.homeTeam.sog ?? 0,
      lastPeriodType: box.gameOutcome?.lastPeriodType ?? box.periodDescriptor?.periodType ?? "REG",
      awayGoalieId: starter(stats.awayTeam),
      homeGoalieId: starter(stats.homeTeam),
      venue: box.venue?.default ?? null,
    });
    const ins = insertPlayer();
    for (const side of ["awayTeam", "homeTeam"] as const) {
      const isHome = side === "homeTeam";
      const team = box[side].abbrev;
      const opponent = (isHome ? box.awayTeam : box.homeTeam).abbrev;
      const base = { gameId: box.id, team, opponent, isHome: isHome ? 1 : 0, date: box.gameDate, season: box.season };
      for (const s of [...stats[side].forwards, ...stats[side].defense]) {
        ins.run({
          ...base,
          playerId: s.playerId,
          name: s.name.default,
          position: s.position,
          goals: s.goals ?? 0,
          assists: s.assists ?? 0,
          points: s.points ?? 0,
          shots: s.sog ?? 0,
          ppGoals: s.powerPlayGoals ?? 0,
          toiSec: toiToSec(s.toi),
          shotsAgainst: null,
          saves: null,
          goalsAgainst: null,
          starter: null,
        });
      }
      for (const g of stats[side].goalies) {
        if (toiToSec(g.toi) === 0) continue; // dressed but didn't play
        ins.run({
          ...base,
          playerId: g.playerId,
          name: g.name.default,
          position: "G",
          goals: 0,
          assists: 0,
          points: 0,
          shots: 0,
          ppGoals: 0,
          toiSec: toiToSec(g.toi),
          shotsAgainst: g.shotsAgainst ?? 0,
          saves: g.saves ?? 0,
          goalsAgainst: g.goalsAgainst ?? 0,
          starter: g.starter ? 1 : 0,
        });
      }
    }
  });
  tx();
  return true;
}

/** Fetch and store box scores for the given game ids, a few at a time. */
export async function ingestGames(ids: number[], opts: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {}) {
  const { concurrency = 6, onProgress } = opts;
  const todo = ids.filter((id) => !hasGame(id));
  let done = 0;
  let added = 0;
  const errors: string[] = [];
  const queue = [...todo];
  async function worker() {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const box = await api.boxscore(id);
      if (box.data && storeBoxscore(box.data)) added++;
      else if (box.error) errors.push(`${id}: ${box.error}`);
      onProgress?.(++done, todo.length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { requested: todo.length, added, errors };
}

/** Pick up games finished in the last few days. Cheap enough to run on page load. */
export async function ingestRecent(days = 3) {
  const ids: number[] = [];
  const d = new Date();
  for (let i = 0; i <= days; i++) {
    const date = todayIso(new Date(d.getTime() - i * 86_400_000));
    const score = await api.score(date);
    for (const g of score.data?.games ?? []) {
      if ((g.gameType === 2 || g.gameType === 3) && DONE.has(g.gameState)) ids.push(g.id);
    }
  }
  const res = await ingestGames(ids);
  await ingestDetails(ids);
  return res;
}

export function gameCount(season?: number): number {
  const row = season
    ? (sqlite.prepare("SELECT COUNT(*) AS n FROM games WHERE season = ?").get(season) as { n: number })
    : (sqlite.prepare("SELECT COUNT(*) AS n FROM games").get() as { n: number });
  return row.n;
}

// ---------- goal scorers & three stars ----------

export interface GoalSummary {
  period: number;
  periodType: string;
  time: string;
  team: string;
  scorer: string;
  scorerId: number;
  assists: string[];
  strength: string;
  score: string; // "1-0" away-home
}
export interface StarSummary {
  star: number;
  playerId: number;
  name: string;
  team: string;
  line: string; // "2G 1A" or ".942 SV%"
}

export function storeDetails(landing: GameLandingResponse): boolean {
  if (!DONE.has(landing.gameState) || !landing.summary) return false;
  const goals: GoalSummary[] = landing.summary.scoring.flatMap((p) =>
    p.goals.map((g) => ({
      period: p.periodDescriptor.number,
      periodType: p.periodDescriptor.periodType,
      time: g.timeInPeriod,
      team: g.teamAbbrev.default,
      scorer: g.name.default,
      scorerId: g.playerId,
      assists: g.assists.map((a) => a.name.default),
      strength: g.strength,
      score: `${g.awayScore}-${g.homeScore}`,
    })),
  );
  const stars: StarSummary[] = (landing.summary.threeStars ?? []).map((s) => ({
    star: s.star,
    playerId: s.playerId,
    name: s.name.default,
    team: s.teamAbbrev,
    line:
      s.position === "G"
        ? s.savePctg !== undefined
          ? `${s.savePctg.toFixed(3).replace(/^0/, "")} SV%`
          : "G"
        : `${s.goals ?? 0}G ${s.assists ?? 0}A`,
  }));
  sqlite.prepare("INSERT OR REPLACE INTO game_details (game_id, goals, stars) VALUES (?, ?, ?)").run(landing.id, JSON.stringify(goals), JSON.stringify(stars));
  return true;
}

export async function ingestDetails(ids: number[], concurrency = 6) {
  const have = new Set((sqlite.prepare("SELECT game_id FROM game_details").all() as { game_id: number }[]).map((r) => r.game_id));
  const queue = ids.filter((id) => !have.has(id));
  let added = 0;
  async function worker() {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const l = await api.landing(id);
      if (l.data && storeDetails(l.data)) added++;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return added;
}
