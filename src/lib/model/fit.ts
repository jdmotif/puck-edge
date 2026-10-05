// Fit the moneyline model on stored games and produce an out-of-sample backtest.
import { sqlite } from "@/db";
import { League, PRIOR_MONEYLINE, moneylineFeatures } from "./features";
import { expectedGoals, loadGames, saveMoneylineParams, type MoneylineParams } from "./engine";
import { brier, fitLogistic, gameDistribution, lambdasFor, logLoss, puckLineProbs, sigmoid, totalProbs } from "./math";

interface Sample {
  id: number;
  season: number;
  date: string;
  x: number[];
  y: number;
  expTotal: number;
  actualTotal: number;
  homeMargin: number;
}

/** Walk through games in date order, recording the features as they looked before each game. */
export function buildSamples(): Sample[] {
  const league = new League();
  const out: Sample[] = [];
  for (const g of loadGames()) {
    league.startSeason(g.season);
    const home = league.teamProfile(g.home, g.date);
    const away = league.teamProfile(g.away, g.date);
    const hg = league.goalieProfile(g.homeGoalieId);
    const ag = league.goalieProfile(g.awayGoalieId);
    out.push({
      id: g.id,
      season: g.season,
      date: g.date,
      x: moneylineFeatures(home, away, hg, ag),
      y: g.homeScore > g.awayScore ? 1 : 0,
      expTotal: expectedGoals(home, away, hg, ag, league).total,
      actualTotal: g.homeScore + g.awayScore,
      homeMargin: g.homeScore - g.awayScore,
    });
    league.add(g);
  }
  return out;
}

const MIN_TRAIN = 300;
const fit = (s: Sample[]): MoneylineParams => {
  if (s.length < MIN_TRAIN) return PRIOR_MONEYLINE;
  const { weights, intercept } = fitLogistic(
    s.map((r) => r.x),
    s.map((r) => r.y),
    { l2: 0.02, iters: 1500, lr: 0.3 },
  );
  return { weights, intercept, fitted: true, n: s.length };
};

/**
 * Fit on everything for live use, then backtest by refitting at the start of each month
 * on only the games before it (walk-forward, no peeking).
 */
export function fitAndBacktest(log: (m: string) => void = () => {}) {
  const samples = buildSamples();
  log(`Built ${samples.length} samples`);

  const finalParams = fit(samples);
  if (finalParams.fitted) {
    const probs = samples.map((s) => sigmoid(finalParams.intercept + s.x.reduce((a, x, i) => a + x * finalParams.weights[i], 0)));
    finalParams.logLoss = logLoss(probs, samples.map((s) => s.y));
    saveMoneylineParams(finalParams);
    log(`Moneyline fitted on ${samples.length} games, in-sample log loss ${finalParams.logLoss.toFixed(4)}`);
  } else {
    log(`Only ${samples.length} games stored; keeping prior weights until ${MIN_TRAIN}.`);
  }

  const ins = sqlite.prepare(`INSERT OR REPLACE INTO backtest
    (game_id, season, date, home_win_prob, home_won, exp_total, actual_total, over55_prob, home_cover15_prob)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const months = [...new Set(samples.map((s) => s.date.slice(0, 7)))];
  const oos: { p: number; y: number }[] = [];
  const tx = sqlite.transaction(() => {
    sqlite.exec("DELETE FROM backtest");
    for (const month of months) {
      const train = samples.filter((s) => s.date < month + "-01");
      const params = fit(train);
      for (const s of samples.filter((r) => r.date.startsWith(month))) {
        const p = Math.min(0.95, Math.max(0.05, sigmoid(params.intercept + s.x.reduce((a, x, i) => a + x * params.weights[i], 0))));
        const { lambdaHome, lambdaAway } = lambdasFor(p, s.expTotal);
        const dist = gameDistribution(lambdaHome, lambdaAway);
        ins.run(s.id, s.season, s.date, p, s.y, s.expTotal, s.actualTotal, totalProbs(dist, 5.5).over, puckLineProbs(dist).homeMinus15);
        oos.push({ p, y: s.y });
      }
    }
  });
  tx();
  if (oos.length) {
    log(
      `Backtest: ${oos.length} games, log loss ${logLoss(oos.map((o) => o.p), oos.map((o) => o.y)).toFixed(4)}, Brier ${brier(
        oos.map((o) => o.p),
        oos.map((o) => o.y),
      ).toFixed(4)}`,
    );
  }
  return { samples: samples.length, params: finalParams };
}
