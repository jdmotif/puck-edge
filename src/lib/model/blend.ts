// Anchoring picks on the market. The pick probability starts from the bookmakers' margin-free price
// and moves a fraction `w` of the way toward the model: p = market + w × (model − market).
// Edges then measure only what the model adds to the market, instead of every gap between a weak
// model and a strong market.
//
// Why w = 0.2 by default: no free feed keeps historical NHL odds (the schedule and score endpoints
// drop them once a game is played), so the backtest can't fit w directly. What the backtest does show
// (walk-forward on 1,437 games, see reviews/puck-edge-review.md) is that the model beats a constant
// home-win guess by 0.011 log loss (0.681 vs 0.692) while closing lines usually sit around 0.67 to
// 0.68, and that the model's inputs are public box-score numbers the market already prices. A model
// with well under half the market's skill and mostly the same information earns a small weight.
// Once enough moneyline picks have closing prices and results, `fitBlendWeight` takes over.
import { logLoss } from "./math";

export const DEFAULT_BLEND_WEIGHT = 0.2;
export const MIN_BLEND_FIT = 300; // graded moneyline picks with a closing price before w is refit

export const blend = (model: number, market: number, w: number) => market + w * (model - market);

/** The weight that would have minimised log loss on graded picks: model vs closing market vs result. */
export function fitBlendWeight(rows: { model: number; market: number; won: boolean }[]): number {
  let best = DEFAULT_BLEND_WEIGHT;
  let bestLoss = Infinity;
  for (let i = 0; i <= 100; i++) {
    const w = i / 100;
    const loss = logLoss(rows.map((r) => blend(r.model, r.market, w)), rows.map((r) => (r.won ? 1 : 0)));
    if (loss < bestLoss - 1e-12) {
      bestLoss = loss;
      best = w;
    }
  }
  return best;
}
