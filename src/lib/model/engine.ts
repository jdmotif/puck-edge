// Game-level predictions: moneyline (logistic), totals (Poisson), puck line (same Poisson distribution).
import { sqlite } from "@/db";
import {
  clamp,
  gameDistribution,
  lambdasFor,
  puckLineProbs,
  sigmoid,
  totalProbs,
} from "./math";
import { FEATURE_NAMES, League, PRIOR_MONEYLINE, moneylineFeatures, type GameRow, type GoalieProfile, type TeamProfile } from "./features";

export interface MoneylineParams {
  intercept: number;
  weights: number[];
  fitted: boolean;
  n: number;
  logLoss?: number;
  fittedAt?: number;
}

const HOME_GOAL_FACTOR = 1.035; // home teams score ~7% more than road teams in recent seasons
const B2B_FACTOR = 0.035; // a back-to-back team scores ~3.5% less and allows ~3.5% more

export function loadMoneylineParams(): MoneylineParams {
  const row = sqlite.prepare("SELECT value, fitted_at FROM model_params WHERE key = 'moneyline'").get() as
    | { value: string; fitted_at: number }
    | undefined;
  if (!row) return PRIOR_MONEYLINE;
  return { ...JSON.parse(row.value), fittedAt: row.fitted_at };
}

export function saveMoneylineParams(p: MoneylineParams) {
  sqlite
    .prepare("INSERT INTO model_params (key, value, fitted_at) VALUES ('moneyline', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fitted_at = excluded.fitted_at")
    .run(JSON.stringify(p), Date.now());
}

export function loadGames(before?: string): GameRow[] {
  const sql = `SELECT id, season, game_type AS gameType, date, away, home, away_score AS awayScore, home_score AS homeScore,
      away_sog AS awaySog, home_sog AS homeSog, last_period_type AS lastPeriodType, away_goalie_id AS awayGoalieId, home_goalie_id AS homeGoalieId
    FROM games ${before ? "WHERE date < ?" : ""} ORDER BY date, id`;
  return (before ? sqlite.prepare(sql).all(before) : sqlite.prepare(sql).all()) as GameRow[];
}

// Building the league state is cheap (a few thousand rows) but we still cache it per day.
let cached: { key: string; league: League } | null = null;
export function leagueAsOf(date: string, season: number): League {
  const meta = sqlite.prepare("SELECT COUNT(*) AS n, MAX(id) AS m FROM games WHERE date < ?").get(date) as { n: number; m: number | null };
  const key = `${date}:${season}:${meta.n}:${meta.m}`;
  if (cached?.key === key) return cached.league;
  const league = new League();
  for (const g of loadGames(date)) league.add(g);
  league.startSeason(season); // make sure the current season is "current" even before its first game
  cached = { key, league };
  return league;
}

export interface GameInput {
  home: string;
  away: string;
  date: string; // YYYY-MM-DD
  homeGoalieId?: number | null;
  awayGoalieId?: number | null;
}

export interface Contribution {
  feature: (typeof FEATURE_NAMES)[number] | "homeIce";
  value: number; // log-odds contribution toward the home team
}

export interface GamePrediction {
  home: TeamProfile;
  away: TeamProfile;
  homeGoalie: GoalieProfile;
  awayGoalie: GoalieProfile;
  homeWin: number;
  awayWin: number;
  lambdaHome: number;
  lambdaAway: number;
  expTotal: number;
  contributions: Contribution[];
  totals: (line: number) => { over: number; under: number; push: number };
  puckLine: ReturnType<typeof puckLineProbs>;
  regTie: number;
  params: MoneylineParams;
}

export function predictGame(input: GameInput, league: League, params = loadMoneylineParams()): GamePrediction {
  const home = league.teamProfile(input.home, input.date);
  const away = league.teamProfile(input.away, input.date);
  const homeGoalie = league.goalieProfile(input.homeGoalieId ?? league.projectedStarter(input.home, input.date));
  const awayGoalie = league.goalieProfile(input.awayGoalieId ?? league.projectedStarter(input.away, input.date));

  // Moneyline: logistic on feature differences (home − away), intercept = home ice.
  const x = moneylineFeatures(home, away, homeGoalie, awayGoalie);
  const contributions: Contribution[] = [
    { feature: "homeIce", value: params.intercept },
    ...FEATURE_NAMES.map((f, i) => ({ feature: f, value: params.weights[i] * x[i] })),
  ];
  const z = contributions.reduce((s, c) => s + c.value, 0);
  const homeWin = clamp(sigmoid(z), 0.05, 0.95);

  const expTotal = expectedGoals(home, away, homeGoalie, awayGoalie, league).total;

  // Puck line uses a Poisson split that reproduces the moneyline probability at the projected total,
  // so the three markets never contradict each other.
  const { lambdaHome, lambdaAway } = lambdasFor(homeWin, expTotal);
  const dist = gameDistribution(lambdaHome, lambdaAway);

  return {
    home,
    away,
    homeGoalie,
    awayGoalie,
    homeWin,
    awayWin: 1 - homeWin,
    lambdaHome,
    lambdaAway,
    expTotal,
    contributions,
    totals: (line: number) => totalProbs(dist, line),
    puckLine: puckLineProbs(dist),
    regTie: dist.regTie,
    params,
  };
}

/** Totals model: each side's expected goals = league rate × attack × opponent defence × goalie × venue × rest. */
export function expectedGoals(home: TeamProfile, away: TeamProfile, homeGoalie: GoalieProfile, awayGoalie: GoalieProfile, league: League) {
  const lg = league.leagueGoalsPerTeamGame();
  const lgSv = league.leagueSavePct();
  // How the expected starter compares with the team's overall save % (the defence term already includes it).
  const goalieFactor = (g: GoalieProfile, team: TeamProfile) =>
    clamp((1 - g.savePct) / Math.max(0.05, 1 - (team.gp ? team.teamSavePct : lgSv)), 0.8, 1.25);
  const rest = (t: TeamProfile) => (t.backToBack ? 1 - B2B_FACTOR : 1);
  const restAgainst = (t: TeamProfile) => (t.backToBack ? 1 + B2B_FACTOR : 1);
  const homeXg = lg * (home.gfpg / lg) * (away.gapg / lg) * goalieFactor(awayGoalie, away) * HOME_GOAL_FACTOR * rest(home) * restAgainst(away);
  const awayXg = lg * (away.gfpg / lg) * (home.gapg / lg) * goalieFactor(homeGoalie, home) * (2 - HOME_GOAL_FACTOR) * rest(away) * restAgainst(home);
  return { home: homeXg, away: awayXg, total: homeXg + awayXg };
}
