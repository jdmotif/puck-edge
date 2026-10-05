// Team and goalie form, built from the stored games table. Used both live and for walk-forward fitting.
import { shrink, clamp } from "./math";

export interface GameRow {
  id: number;
  season: number;
  gameType: number;
  date: string;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  awaySog: number;
  homeSog: number;
  lastPeriodType: string;
  awayGoalieId: number | null;
  homeGoalieId: number | null;
}

export interface TeamResult {
  date: string;
  opp: string;
  home: boolean;
  gf: number;
  ga: number;
  win: boolean;
  otl: boolean; // lost in OT/SO (1 point)
}

export interface TeamAcc {
  gp: number;
  gf: number;
  ga: number;
  sf: number;
  sa: number;
  results: TeamResult[];
  // goals against while each goalie was in net is tracked on GoalieAcc
}

export interface GoalieAcc {
  starts: number;
  shotsAgainst: number;
  goalsAgainst: number;
  lastStart: string | null;
  team: string;
}

export const LEAGUE_DEFAULTS = {
  goalsPerTeamGame: 3.05,
  shotsPerTeamGame: 28.5,
  savePct: 0.9,
};

/** Accumulates games in date order; snapshots give "what we knew before this game". */
export class League {
  teams = new Map<string, TeamAcc>();
  prevTeams = new Map<string, TeamAcc>(); // previous season, used as a prior early in a season
  goalies = new Map<number, GoalieAcc>(); // current season
  prevGoalies = new Map<number, GoalieAcc>();
  season = 0;
  totals = { games: 0, goals: 0, shots: 0, homeWins: 0 };

  private team(abbrev: string) {
    let t = this.teams.get(abbrev);
    if (!t) this.teams.set(abbrev, (t = { gp: 0, gf: 0, ga: 0, sf: 0, sa: 0, results: [] }));
    return t;
  }

  private goalie(id: number, team: string) {
    let g = this.goalies.get(id);
    if (!g) this.goalies.set(id, (g = { starts: 0, shotsAgainst: 0, goalsAgainst: 0, lastStart: null, team }));
    g.team = team;
    return g;
  }

  startSeason(season: number) {
    if (season === this.season) return;
    if (this.season) {
      this.prevTeams = this.teams;
      this.prevGoalies = this.goalies;
    }
    this.teams = new Map();
    this.goalies = new Map();
    this.totals = { games: 0, goals: 0, shots: 0, homeWins: 0 };
    this.season = season;
  }

  add(g: GameRow) {
    this.startSeason(g.season);
    const decided = g.lastPeriodType !== "REG";
    const homeWin = g.homeScore > g.awayScore;
    const h = this.team(g.home);
    const a = this.team(g.away);
    h.gp++; a.gp++;
    h.gf += g.homeScore; h.ga += g.awayScore; h.sf += g.homeSog; h.sa += g.awaySog;
    a.gf += g.awayScore; a.ga += g.homeScore; a.sf += g.awaySog; a.sa += g.homeSog;
    h.results.push({ date: g.date, opp: g.away, home: true, gf: g.homeScore, ga: g.awayScore, win: homeWin, otl: !homeWin && decided });
    a.results.push({ date: g.date, opp: g.home, home: false, gf: g.awayScore, ga: g.homeScore, win: !homeWin, otl: homeWin && decided });
    // Starter gets the whole game's shots/goals; a fair approximation of starter quality.
    // Shootout goals aren't shots on the goalie, so take one off the loser's goals against.
    const soAdj = g.lastPeriodType === "SO" ? 1 : 0;
    if (g.homeGoalieId) {
      const gl = this.goalie(g.homeGoalieId, g.home);
      gl.starts++; gl.shotsAgainst += g.awaySog; gl.goalsAgainst += g.awayScore - (homeWin ? 0 : soAdj); gl.lastStart = g.date;
    }
    if (g.awayGoalieId) {
      const gl = this.goalie(g.awayGoalieId, g.away);
      gl.starts++; gl.shotsAgainst += g.homeSog; gl.goalsAgainst += g.homeScore - (homeWin ? soAdj : 0); gl.lastStart = g.date;
    }
    this.totals.games++;
    this.totals.goals += g.homeScore + g.awayScore;
    this.totals.shots += g.homeSog + g.awaySog;
    if (homeWin) this.totals.homeWins++;
  }

  leagueGoalsPerTeamGame() {
    return shrink(this.totals.goals / Math.max(1, 2 * this.totals.games), 2 * this.totals.games, LEAGUE_DEFAULTS.goalsPerTeamGame, 200);
  }

  leagueSavePct() {
    const sv = 1 - this.totals.goals / Math.max(1, this.totals.shots);
    return this.totals.shots ? shrink(sv, this.totals.games, LEAGUE_DEFAULTS.savePct, 100) : LEAGUE_DEFAULTS.savePct;
  }

  /** Team strength numbers, regressed toward last season (then league average) when the sample is small. */
  teamProfile(abbrev: string, asOf: string) {
    const t = this.teams.get(abbrev) ?? { gp: 0, gf: 0, ga: 0, sf: 0, sa: 0, results: [] };
    const p = this.prevTeams.get(abbrev);
    const lg = this.leagueGoalsPerTeamGame();
    // Last season's numbers, regressed a third of the way to average, are the prior.
    const prior = (prev: number | undefined, avg: number) => (prev === undefined ? avg : avg + (prev - avg) * 0.67);
    const K = 12; // games of prior weight
    const gfpg = shrink(t.gp ? t.gf / t.gp : 0, t.gp, prior(p?.gp ? p.gf / p.gp : undefined, lg), K);
    const gapg = shrink(t.gp ? t.ga / t.gp : 0, t.gp, prior(p?.gp ? p.ga / p.gp : undefined, lg), K);
    const shotShare = shrink(t.sf + t.sa ? t.sf / (t.sf + t.sa) : 0.5, t.gp, prior(p && p.sf + p.sa ? p.sf / (p.sf + p.sa) : undefined, 0.5), K);
    // Regressed like the goalie numbers; a raw .950 from three games would make any starter
    // look far worse than "his team" and inflate the totals projection.
    const lgSv = this.leagueSavePct();
    const priorSv = p?.sa ? lgSv + (1 - p.ga / p.sa - lgSv) * 0.67 : lgSv;
    const teamSavePct = shrink(t.sa ? 1 - t.ga / t.sa : lgSv, t.sa, priorSv, K * LEAGUE_DEFAULTS.shotsPerTeamGame);
    const last10 = t.results.slice(-10);
    // Points % over the last 10, weighted 1..10 toward the most recent game.
    let wSum = 0, wPts = 0;
    last10.forEach((r, i) => {
      const w = i + 1;
      wSum += w;
      wPts += w * (r.win ? 1 : r.otl ? 0.5 : 0);
    });
    const form = wSum ? shrink(wPts / wSum, last10.length, 0.5, 4) : 0.5;
    const l10 = {
      w: last10.filter((r) => r.win).length,
      l: last10.filter((r) => !r.win && !r.otl).length,
      otl: last10.filter((r) => r.otl).length,
    };
    const last = t.results.at(-1);
    const restDays = last ? daysBetween(last.date, asOf) - 1 : 3;
    const homeRes = t.results.filter((r) => r.home);
    const roadRes = t.results.filter((r) => !r.home);
    return {
      abbrev,
      gp: t.gp,
      gfpg,
      gapg,
      gdpg: gfpg - gapg,
      shotShare,
      form,
      l10,
      restDays: clamp(restDays, 0, 7),
      backToBack: restDays === 0,
      teamSavePct,
      record: recordOf(t.results),
      homeRecord: recordOf(homeRes),
      roadRecord: recordOf(roadRes),
      streak: streakOf(t.results),
    };
  }

  /** Goalie save % regressed toward league average (≈ 600 shots of prior). */
  goalieProfile(id: number | null | undefined) {
    const lgSv = this.leagueSavePct();
    if (!id) return { id: null, savePct: lgSv, shots: 0, starts: 0, quality: 0, lastStart: null as string | null };
    const cur = this.goalies.get(id);
    const prev = this.prevGoalies.get(id);
    const shots = (cur?.shotsAgainst ?? 0) + 0.5 * (prev?.shotsAgainst ?? 0);
    const goals = (cur?.goalsAgainst ?? 0) + 0.5 * (prev?.goalsAgainst ?? 0);
    const raw = shots ? 1 - goals / shots : lgSv;
    const savePct = shrink(raw, shots, lgSv, 600);
    return {
      id,
      savePct,
      shots: cur?.shotsAgainst ?? 0,
      starts: cur?.starts ?? 0,
      // goals saved above average per 30 shots
      quality: (savePct - lgSv) * 30,
      lastStart: cur?.lastStart ?? null,
    };
  }

  /** Most likely starter: the goalie with most starts in the team's last 10, or the backup on a back-to-back. */
  projectedStarter(team: string, asOf: string): number | null {
    const candidates = [...this.goalies.entries()].filter(([, g]) => g.team === team);
    if (!candidates.length) return null;
    candidates.sort((a, b) => b[1].starts - a[1].starts);
    const [first, second] = candidates;
    if (first && second && first[1].lastStart && daysBetween(first[1].lastStart, asOf) === 1) return second[0];
    return first[0];
  }
}

export type TeamProfile = ReturnType<League["teamProfile"]>;
export type GoalieProfile = ReturnType<League["goalieProfile"]>;

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);
}

function recordOf(results: TeamResult[]) {
  const w = results.filter((r) => r.win).length;
  const otl = results.filter((r) => r.otl).length;
  return { w, l: results.length - w - otl, otl };
}

function streakOf(results: TeamResult[]) {
  if (!results.length) return null;
  const code = (r: TeamResult) => (r.win ? "W" : r.otl ? "OT" : "L");
  const last = code(results[results.length - 1]);
  let n = 0;
  for (let i = results.length - 1; i >= 0 && code(results[i]) === last; i--) n++;
  return { code: last, count: n };
}

// ---------- moneyline features ----------

export const FEATURE_NAMES = ["shotShare", "goalDiff", "form", "rest", "backToBack", "goalie"] as const;

export function moneylineFeatures(home: TeamProfile, away: TeamProfile, hg: GoalieProfile, ag: GoalieProfile): number[] {
  return [
    (home.shotShare - away.shotShare) * 10, // scaled so a 5-point shot-share gap ≈ 0.5
    home.gdpg - away.gdpg,
    (home.form - away.form) * 2,
    (Math.min(home.restDays, 3) - Math.min(away.restDays, 3)) / 3,
    (home.backToBack ? 1 : 0) - (away.backToBack ? 1 : 0),
    hg.quality - ag.quality,
  ];
}

/** Starting weights before any games are stored (roughly what the fit converges to on recent seasons). */
export const PRIOR_MONEYLINE = {
  intercept: 0.17, // home ice ≈ 54%
  weights: [0.35, 0.3, 0.15, 0.05, -0.12, 0.12],
  fitted: false,
  n: 0,
};
