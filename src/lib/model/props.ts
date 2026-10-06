// Player props: anytime goal, 1+ point, 2+ points. Poisson on a blended per-game rate.
import { sqlite } from "@/db";
import type { ClubSkaterStats } from "@/lib/nhl/types";
import { clamp, probAtLeastOne, probAtLeastTwo, shrink } from "./math";
import type { GoalieProfile, TeamProfile } from "./features";
import { i18n, type Messages } from "@/lib/i18n";

const PRIOR = {
  F: { goals: 0.2, points: 0.5 },
  D: { goals: 0.07, points: 0.33 },
};

interface RecentLine {
  goals: number;
  points: number;
  toi_sec: number;
  date: string;
}

export interface PropProjection {
  playerId: number;
  name: string;
  team: string;
  position: string;
  gp: number;
  goalRate: number; // blended goals per game before matchup adjustments
  pointRate: number;
  lambdaGoals: number;
  lambdaPoints: number;
  pGoal: number;
  pPoint1: number;
  pPoint2: number;
  last10: { gp: number; goals: number; points: number };
  last5Points: number;
  last5Gp: number;
  ppGoals: number;
  toiSec: number;
  reasons: string[];
}

function recent(playerId: number, season: number, n: number): RecentLine[] {
  return sqlite
    .prepare("SELECT goals, points, toi_sec, date FROM player_games WHERE player_id = ? AND season = ? AND position != 'G' ORDER BY date DESC LIMIT ?")
    .all(playerId, season, n) as RecentLine[];
}

function priorSeason(playerId: number, season: number) {
  return sqlite
    .prepare("SELECT COUNT(*) AS gp, COALESCE(SUM(goals),0) AS g, COALESCE(SUM(points),0) AS p FROM player_games WHERE player_id = ? AND season = ?")
    .get(playerId, season - 10001) as { gp: number; g: number; p: number };
}

export function projectProps(
  skaters: ClubSkaterStats[],
  team: string,
  ctx: {
    season: number;
    isHome: boolean;
    opponent: TeamProfile;
    opponentGoalie: GoalieProfile & { name?: string };
    teamExpectedGoals: number; // this game's projected goals for the team
    teamAvgGoals: number; // team's normal goals per game
    leagueGoals: number;
    leagueSavePct: number;
  },
  W: Messages["why"] = i18n("en").t.why,
): PropProjection[] {
  // Points and goals scale with how many goals the team is expected to score tonight vs normal.
  const matchup = clamp(ctx.teamExpectedGoals / Math.max(1.5, ctx.teamAvgGoals), 0.7, 1.4);
  return skaters
    .filter((s) => s.gamesPlayed > 0 && s.positionCode !== "G")
    .map((s) => {
      const pos = s.positionCode === "D" ? "D" : "F";
      const prev = priorSeason(s.playerId, ctx.season);
      const priorGoals = prev.gp >= 20 ? PRIOR[pos].goals + (prev.g / prev.gp - PRIOR[pos].goals) * 0.75 : PRIOR[pos].goals;
      const priorPoints = prev.gp >= 20 ? PRIOR[pos].points + (prev.p / prev.gp - PRIOR[pos].points) * 0.75 : PRIOR[pos].points;
      const seasonGoals = shrink(s.goals / s.gamesPlayed, s.gamesPlayed, priorGoals, 20);
      const seasonPoints = shrink(s.points / s.gamesPlayed, s.gamesPlayed, priorPoints, 15);

      const last = recent(s.playerId, ctx.season, 10);
      const l10 = { gp: last.length, goals: last.reduce((a, r) => a + r.goals, 0), points: last.reduce((a, r) => a + r.points, 0) };
      const last5 = last.slice(0, 5);
      // Recent form gets 35% weight, itself shrunk toward the season rate.
      const recentGoals = l10.gp ? shrink(l10.goals / l10.gp, l10.gp, seasonGoals, 10) : seasonGoals;
      const recentPoints = l10.gp ? shrink(l10.points / l10.gp, l10.gp, seasonPoints, 10) : seasonPoints;
      const goalRate = 0.65 * seasonGoals + 0.35 * recentGoals;
      const pointRate = 0.65 * seasonPoints + 0.35 * recentPoints;

      // Ice time trend: more minutes lately → more chances.
      const recentToi = last5.length ? last5.reduce((a, r) => a + r.toi_sec, 0) / last5.length : s.avgTimeOnIcePerGame;
      const toiFactor = s.avgTimeOnIcePerGame > 0 ? clamp(recentToi / s.avgTimeOnIcePerGame, 0.85, 1.15) : 1;
      const goalieFactor = clamp((1 - ctx.opponentGoalie.savePct) / (1 - ctx.leagueSavePct), 0.8, 1.25);
      const venue = ctx.isHome ? 1.03 : 0.97;
      const lambdaGoals = goalRate * matchup * toiFactor * venue * goalieFactor;
      const lambdaPoints = pointRate * matchup * toiFactor * venue * Math.sqrt(goalieFactor);

      const reasons: string[] = [];
      reasons.push(W.propSeason(s.goals, s.points, s.gamesPlayed));
      if (l10.gp >= 3) reasons.push(W.propRecent(l10.goals, l10.points, l10.gp));
      if (s.powerPlayGoals >= 2) reasons.push(W.propPP(s.powerPlayGoals));
      if (toiFactor >= 1.05) reasons.push(W.propToiUp(Math.round(recentToi / 60), Math.round(s.avgTimeOnIcePerGame / 60)));
      if (toiFactor <= 0.95) reasons.push(W.propToiDown(Math.round(recentToi / 60), Math.round(s.avgTimeOnIcePerGame / 60)));
      if (ctx.opponent.gapg > ctx.leagueGoals * 1.06) reasons.push(W.propSoftD(ctx.opponent.abbrev, ctx.opponent.gapg, ctx.leagueGoals));
      if (ctx.opponent.gapg < ctx.leagueGoals * 0.94) reasons.push(W.propToughD(ctx.opponent.abbrev, ctx.opponent.gapg));
      if (ctx.opponentGoalie.name && Math.abs(goalieFactor - 1) > 0.05) reasons.push(W.propGoalie(ctx.opponentGoalie.name, ctx.opponentGoalie.savePct));

      return {
        playerId: s.playerId,
        name: `${s.firstName.default} ${s.lastName.default}`,
        team,
        position: s.positionCode,
        gp: s.gamesPlayed,
        goalRate,
        pointRate,
        lambdaGoals,
        lambdaPoints,
        pGoal: probAtLeastOne(lambdaGoals),
        pPoint1: probAtLeastOne(lambdaPoints),
        pPoint2: probAtLeastTwo(lambdaPoints),
        last10: l10,
        last5Points: last5.reduce((a, r) => a + r.points, 0),
        last5Gp: last5.length,
        ppGoals: s.powerPlayGoals,
        toiSec: s.avgTimeOnIcePerGame,
        reasons,
      };
    })
    .sort((a, b) => b.lambdaPoints - a.lambdaPoints);
}
