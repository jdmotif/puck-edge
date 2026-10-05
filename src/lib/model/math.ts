// Probability maths used by the picks engine. Pure functions, unit-tested in math.test.ts.

// ---------- odds ----------

export function americanToDecimal(american: number): number {
  if (american === 0 || !Number.isFinite(american)) throw new Error(`Invalid American odds: ${american}`);
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american;
}

export function decimalToAmerican(decimal: number): number {
  if (!(decimal > 1)) throw new Error(`Invalid decimal odds: ${decimal}`);
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

/** Parse "+184", "-225", "184" (American) or "3.10" (decimal). Returns decimal odds, or null. */
export function parseOdds(raw: string | number): number | null {
  const s = String(raw).trim();
  if (!s) return null;
  if (/^[+-]\d+(\.0+)?$/.test(s)) return americanToDecimal(Number(s));
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n < 50 && s.includes(".")) return n; // decimal
  if (Math.abs(n) >= 100) return americanToDecimal(n); // unsigned American like "184"
  return n > 1 ? n : null;
}

export const impliedProb = (decimal: number) => 1 / decimal;

/** Bookmaker margin (overround) of a market, e.g. 0.045 for 4.5%. */
export function overround(decimals: number[]): number {
  return decimals.reduce((s, d) => s + 1 / d, 0) - 1;
}

/** Remove the margin by scaling implied probabilities so they sum to 1 (multiplicative method). */
export function removeMargin(decimals: number[]): number[] {
  const raw = decimals.map(impliedProb);
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((p) => p / total);
}

/**
 * Power method: find k so that sum(p_i^k) = 1. Shades more margin off longshots than the
 * multiplicative method, which matches how books price favourite/longshot bias.
 */
export function removeMarginPower(decimals: number[]): number[] {
  const raw = decimals.map(impliedProb);
  let lo = 0.5;
  let hi = 2;
  for (let i = 0; i < 100; i++) {
    const k = (lo + hi) / 2;
    const s = raw.reduce((a, p) => a + Math.pow(p, k), 0);
    if (s > 1) lo = k;
    else hi = k;
  }
  const k = (lo + hi) / 2;
  const out = raw.map((p) => Math.pow(p, k));
  const t = out.reduce((a, b) => a + b, 0);
  return out.map((p) => p / t);
}

/** Edge in probability points: model − fair market. */
export const edge = (modelProb: number, marketProb: number) => modelProb - marketProb;

/** Expected value per unit staked at decimal odds. */
export const expectedValue = (p: number, decimal: number) => p * (decimal - 1) - (1 - p);

// ---------- Kelly ----------

/**
 * Fraction of bankroll to stake. Full Kelly is (b·p − q) / b with b = decimal − 1.
 * Returns 0 for negative-EV bets. `fraction` defaults to ¼ Kelly; `cap` limits the fraction of bankroll.
 */
export function kellyFraction(p: number, decimal: number, fraction = 0.25, cap = 1): number {
  const b = decimal - 1;
  if (b <= 0 || p <= 0) return 0;
  const full = (b * p - (1 - p)) / b;
  if (full <= 0) return 0;
  return Math.min(full * fraction, cap);
}

// ---------- Poisson ----------

export function poissonPmf(k: number, lambda: number): number {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // log-space for numerical stability
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(k * Math.log(lambda) - lambda - logFact);
}

export function poissonCdf(k: number, lambda: number): number {
  let s = 0;
  for (let i = 0; i <= k; i++) s += poissonPmf(i, lambda);
  return Math.min(1, s);
}

/** P(X ≥ k) */
export const poissonAtLeast = (k: number, lambda: number) => (k <= 0 ? 1 : 1 - poissonCdf(k - 1, lambda));

export const MAX_GOALS = 15;

/** matrix[h][a] = P(home scores h, away scores a) in regulation, independent Poissons. */
export function scoreMatrix(lambdaHome: number, lambdaAway: number, max = MAX_GOALS): number[][] {
  // Normalise each truncated marginal so the matrix sums to exactly 1.
  const marginal = (l: number) => {
    const p = Array.from({ length: max + 1 }, (_, i) => poissonPmf(i, l));
    const t = p.reduce((a, b) => a + b, 0);
    return p.map((x) => x / t);
  };
  const ph = marginal(lambdaHome);
  const pa = marginal(lambdaAway);
  return ph.map((h) => pa.map((a) => h * a));
}

export interface GameDistribution {
  homeRegWin: number;
  awayRegWin: number;
  regTie: number;
  homeWin: number; // including OT/SO
  awayWin: number;
  /** P(home wins by ≥2), regulation only, before the empty-net adjustment. */
  homeBy2: number;
  awayBy2: number;
  /** P(regulation margin is exactly 1 for the side) */
  homeBy1: number;
  awayBy1: number;
  /** Distribution of total goals, counting an OT/SO winner as one goal (how books settle totals). */
  totalDist: number[];
}

/**
 * Share of one-goal regulation wins that become two-goal wins via an empty-net goal.
 * Teams pull the goalie when down one late; across recent NHL seasons roughly a fifth of
 * one-goal leads in the final minutes end with an empty-netter. Exposed so it can be tuned.
 */
export const EMPTY_NET_SHIFT = 0.18;

export function gameDistribution(lambdaHome: number, lambdaAway: number, otHomeShare = 0.5): GameDistribution {
  const m = scoreMatrix(lambdaHome, lambdaAway);
  let homeRegWin = 0, awayRegWin = 0, regTie = 0, homeBy2 = 0, awayBy2 = 0, homeBy1 = 0, awayBy1 = 0;
  const totalDist = new Array(2 * MAX_GOALS + 2).fill(0);
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = m[h][a];
      const diff = h - a;
      if (diff > 0) homeRegWin += p;
      else if (diff < 0) awayRegWin += p;
      else regTie += p;
      if (diff >= 2) homeBy2 += p;
      if (diff <= -2) awayBy2 += p;
      if (diff === 1) homeBy1 += p;
      if (diff === -1) awayBy1 += p;
      totalDist[h + a + (diff === 0 ? 1 : 0)] += p;
    }
  }
  return {
    homeRegWin,
    awayRegWin,
    regTie,
    homeWin: homeRegWin + regTie * otHomeShare,
    awayWin: awayRegWin + regTie * (1 - otHomeShare),
    homeBy2,
    awayBy2,
    homeBy1,
    awayBy1,
    totalDist,
  };
}

/** P(total goals > line) and P(< line); a push is possible only on whole-number lines. */
export function totalProbs(dist: GameDistribution, line: number) {
  let over = 0, under = 0, push = 0;
  dist.totalDist.forEach((p, total) => {
    if (total > line) over += p;
    else if (total < line) under += p;
    else push += p;
  });
  return { over, under, push };
}

/** Puck line probabilities for ±1.5, with the empty-net adjustment. */
export function puckLineProbs(dist: GameDistribution, emptyNetShift = EMPTY_NET_SHIFT) {
  const homeMinus = dist.homeBy2 + dist.homeBy1 * emptyNetShift;
  const awayMinus = dist.awayBy2 + dist.awayBy1 * emptyNetShift;
  return {
    homeMinus15: homeMinus,
    awayPlus15: 1 - homeMinus,
    awayMinus15: awayMinus,
    homePlus15: 1 - awayMinus,
  };
}

/** Solve for (λh, λa) so that the Poisson model reproduces a target home-win probability and total. */
export function lambdasFor(homeWinTarget: number, expectedTotal: number, otHomeShare = 0.5) {
  let lo = 0.05, hi = 0.95;
  for (let i = 0; i < 60; i++) {
    const share = (lo + hi) / 2;
    const d = gameDistribution(expectedTotal * share, expectedTotal * (1 - share), otHomeShare);
    if (d.homeWin < homeWinTarget) lo = share;
    else hi = share;
  }
  const share = (lo + hi) / 2;
  return { lambdaHome: expectedTotal * share, lambdaAway: expectedTotal * (1 - share) };
}

// ---------- player props ----------

/** Anytime goal / 1+ point: P(X ≥ 1) for a Poisson rate. */
export const probAtLeastOne = (lambda: number) => 1 - Math.exp(-lambda);
/** 2+ points: P(X ≥ 2) */
export const probAtLeastTwo = (lambda: number) => 1 - Math.exp(-lambda) * (1 + lambda);

// ---------- logistic regression ----------

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const logit = (p: number) => Math.log(p / (1 - p));

/** Fit logistic regression by gradient descent with L2 regularisation (intercept unpenalised). */
export function fitLogistic(X: number[][], y: number[], opts: { l2?: number; iters?: number; lr?: number } = {}) {
  const { l2 = 0.01, iters = 3000, lr = 0.1 } = opts;
  const n = X.length;
  const k = X[0]?.length ?? 0;
  const w = new Array(k).fill(0);
  let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(k).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const z = b + X[i].reduce((s, x, j) => s + x * w[j], 0);
      const err = sigmoid(z) - y[i];
      gb += err;
      for (let j = 0; j < k; j++) gw[j] += err * X[i][j];
    }
    b -= (lr * gb) / n;
    for (let j = 0; j < k; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
  }
  return { weights: w, intercept: b };
}

export function logLoss(probs: number[], outcomes: number[]): number {
  const eps = 1e-12;
  return (
    -probs.reduce((s, p, i) => s + (outcomes[i] ? Math.log(Math.max(p, eps)) : Math.log(Math.max(1 - p, eps))), 0) /
    probs.length
  );
}

export function brier(probs: number[], outcomes: number[]): number {
  return probs.reduce((s, p, i) => s + (p - outcomes[i]) ** 2, 0) / probs.length;
}

/** Group predictions into 10% buckets: predicted mean vs actual hit rate. */
export function calibration(probs: number[], outcomes: number[], buckets = 10) {
  const out = Array.from({ length: buckets }, (_, i) => ({ lo: i / buckets, hi: (i + 1) / buckets, n: 0, predSum: 0, hits: 0 }));
  probs.forEach((p, i) => {
    const b = Math.min(buckets - 1, Math.floor(p * buckets));
    out[b].n++;
    out[b].predSum += p;
    out[b].hits += outcomes[i];
  });
  return out.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, predicted: b.n ? b.predSum / b.n : null, actual: b.n ? b.hits / b.n : null }));
}

/** Shrink an observed rate toward a prior: (obs·n + prior·k) / (n + k). */
export const shrink = (observed: number, n: number, prior: number, k: number) =>
  n + k === 0 ? prior : (observed * n + prior * k) / (n + k);

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
