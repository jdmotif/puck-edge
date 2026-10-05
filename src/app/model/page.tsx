import { sqlite } from "@/db";
import { calibration, brier, logLoss } from "@/lib/model/math";
import { loadMoneylineParams } from "@/lib/model/engine";
import { FEATURE_NAMES } from "@/lib/model/features";
import { MARKET_LABELS, type Market } from "@/lib/grading";
import { CalibrationChart } from "@/components/CalibrationChart";
import { Card, Empty, PageTitle, Pill } from "@/components/ui";
import { pct, units } from "@/lib/format";
import { refreshRecentInBackground } from "@/lib/data/refresh";

export const dynamic = "force-dynamic";

interface Graded { market: Market; p: number; odds: number | null; edge: number | null; result: string; isValue: number; isBest: number; label: string; date: string; gameId: number }

const FEATURE_TEXT: Record<string, string> = {
  homeIce: "Home ice (intercept)",
  shotShare: "Shot share gap (×10)",
  goalDiff: "Goal differential per game gap",
  form: "Recent form gap (weighted L10 points %, ×2)",
  rest: "Rest days gap (/3)",
  backToBack: "Back-to-back (home − away)",
  goalie: "Goalie quality gap (goals saved per 30 shots)",
};

function summarize(rows: Graded[]) {
  const decided = rows.filter((r) => r.result === "win" || r.result === "loss");
  const wins = decided.filter((r) => r.result === "win").length;
  const priced = rows.filter((r) => r.odds !== null && r.result !== "void");
  const profit = priced.reduce((s, r) => s + (r.result === "win" ? r.odds! - 1 : r.result === "loss" ? -1 : 0), 0);
  return {
    n: rows.length,
    decided: decided.length,
    hitRate: decided.length ? wins / decided.length : null,
    expected: decided.length ? decided.reduce((s, r) => s + r.p, 0) / decided.length : null,
    priced: priced.length,
    profit,
    roi: priced.length ? profit / priced.length : null,
  };
}

export default function ModelPage() {
  refreshRecentInBackground();
  const graded = sqlite
    .prepare(
      `SELECT market, model_prob AS p, odds_decimal AS odds, edge, result, is_value AS isValue, is_best AS isBest, selection_label AS label, game_date AS date, game_id AS gameId
       FROM picks WHERE result IS NOT NULL ORDER BY game_date DESC, id DESC`,
    )
    .all() as Graded[];
  const pending = (sqlite.prepare("SELECT COUNT(*) AS n FROM picks WHERE result IS NULL").get() as { n: number }).n;
  const markets = Object.keys(MARKET_LABELS) as Market[];
  const backtest = sqlite.prepare("SELECT home_win_prob AS p, home_won AS y, over55_prob AS o, actual_total AS t, home_cover15_prob AS c FROM backtest").all() as { p: number; y: number; o: number; t: number; c: number }[];
  const params = loadMoneylineParams();
  const margins = sqlite.prepare("SELECT b.home_cover15_prob AS c, g.home_score - g.away_score AS m FROM backtest b JOIN games g ON g.id = b.game_id").all() as { c: number; m: number }[];

  const btCal = calibration(backtest.map((b) => b.p), backtest.map((b) => b.y));
  const btOver = calibration(backtest.map((b) => b.o), backtest.map((b) => (b.t > 5.5 ? 1 : 0)));
  const btPl = calibration(margins.map((b) => b.c), margins.map((b) => (b.m >= 2 ? 1 : 0)));
  const liveMl = graded.filter((g) => g.market === "moneyline" && (g.result === "win" || g.result === "loss"));
  const liveCal = calibration(liveMl.map((g) => g.p), liveMl.map((g) => (g.result === "win" ? 1 : 0)));

  return (
    <>
      <PageTitle sub="Every pick is logged before puck drop and graded automatically after the final.">Model tracking</PageTitle>

      <div className="grid gap-3 md:grid-cols-3">
        {markets.map((m) => {
          const rows = graded.filter((g) => g.market === m);
          const s = summarize(rows);
          const v = summarize(rows.filter((r) => r.isValue));
          const losing = s.roi !== null && s.priced >= 20 && s.roi < 0;
          const underperf = s.hitRate !== null && s.expected !== null && s.decided >= 30 && s.hitRate < s.expected - 0.05;
          return (
            <Card key={m} className={losing ? "border-bad/60" : ""}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{MARKET_LABELS[m]}</h2>
                {losing ? <Pill tone="bad">Losing money</Pill> : s.roi !== null && s.priced >= 20 ? <Pill tone="good">Profitable</Pill> : null}
              </div>
              {s.n === 0 ? (
                <p className="mt-2 text-sm text-muted">No graded picks yet.</p>
              ) : (
                <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm tabular">
                  <dt className="text-muted">Graded</dt><dd className="text-right">{s.n}</dd>
                  <dt className="text-muted">Hit rate</dt><dd className="text-right">{pct(s.hitRate, 1)} <span className="text-xs text-muted">(model said {pct(s.expected, 1)})</span></dd>
                  <dt className="text-muted">ROI, 1u flat</dt>
                  <dd className={`text-right ${s.roi === null ? "" : s.roi >= 0 ? "text-good" : "text-bad"}`}>{s.roi === null ? "no odds logged" : `${pct(s.roi, 1)} (${units(s.profit)} over ${s.priced})`}</dd>
                  {v.n > 0 && <><dt className="text-muted">Value picks only</dt><dd className="text-right">{v.roi === null ? `${pct(v.hitRate, 1)} hit` : `${pct(v.roi, 1)} ROI, n=${v.priced}`}</dd></>}
                </dl>
              )}
              {losing && <p className="mt-2 text-xs text-bad">The model has lost {units(s.profit)} in this market at flat stakes. Treat its picks here with caution until it recovers.</p>}
              {underperf && !losing && <p className="mt-2 text-xs text-warn">Hitting well below what the model predicts: it may be overconfident here.</p>}
            </Card>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">{pending} picks waiting for results. ROI uses the best available price logged with each pick; model-only picks (no odds) count toward hit rate but not ROI.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-sm font-semibold">Moneyline calibration</h2>
          <p className="mb-2 text-xs text-muted">When the model says 60%, does that side win 60% of the time? Dots on the dashed line mean yes. Backtest = walk-forward predictions on stored games, refit each month on earlier games only.</p>
          {backtest.length || liveMl.length ? (
            <CalibrationChart series={[
              ...(liveMl.length ? [{ label: `Live picks (n=${liveMl.length})`, color: "var(--series-1)", buckets: liveCal }] : []),
              ...(backtest.length ? [{ label: `Backtest, home win (n=${backtest.length})`, color: "var(--series-2)", buckets: btCal }] : []),
            ]} />
          ) : <Empty>No data yet. Run <code className="text-ink">npm run sync</code> to backfill games and build the backtest.</Empty>}
          {backtest.length > 0 && (
            <p className="mt-2 text-xs text-ink-2 tabular">
              Backtest log loss {logLoss(backtest.map((b) => b.p), backtest.map((b) => b.y)).toFixed(4)} (coin flip 0.6931) · Brier {brier(backtest.map((b) => b.p), backtest.map((b) => b.y)).toFixed(4)} (coin flip 0.25)
            </p>
          )}
        </Card>
        <Card>
          <h2 className="mb-1 text-sm font-semibold">Totals and puck line calibration (backtest)</h2>
          <p className="mb-2 text-xs text-muted">Over 5.5 goals and home −1.5, predicted vs actual.</p>
          {backtest.length ? (
            <CalibrationChart series={[
              { label: "Over 5.5", color: "var(--series-1)", buckets: btOver },
              { label: "Home −1.5", color: "var(--series-2)", buckets: btPl },
            ]} />
          ) : <Empty>No backtest yet.</Empty>}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Moneyline weights</h2>
          <p className="mb-2 text-xs text-muted">
            {params.fitted ? `Logistic regression fitted on ${params.n} stored games${params.logLoss ? `, log loss ${params.logLoss.toFixed(4)}` : ""}.` : "Prior weights: the model refits once 300+ games are stored."}
            {" "}Positive = favours the team with more of it.
          </p>
          <table className="tabular w-full text-sm">
            <tbody>
              <tr className="border-t border-line"><td className="py-1">{FEATURE_TEXT.homeIce}</td><td className="text-right">{params.intercept.toFixed(3)}</td></tr>
              {FEATURE_NAMES.map((f, i) => (
                <tr key={f} className="border-t border-line"><td className="py-1">{FEATURE_TEXT[f]}</td><td className="text-right">{params.weights[i].toFixed(3)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Recent graded picks</h2>
          {graded.length ? (
            <ul className="space-y-1 text-sm">
              {graded.slice(0, 25).map((g, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-20 text-xs text-muted">{g.date}</span>
                  <a href={`/game/${g.gameId}`} className="flex-1 truncate hover:text-accent">{g.label}</a>
                  <span className="tabular text-xs text-ink-2">{pct(g.p)}</span>
                  <Pill tone={g.result === "win" ? "good" : g.result === "loss" ? "bad" : "neutral"}>{g.result}</Pill>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nothing graded yet. Picks shown on the Tonight page are logged automatically.</p>}
        </Card>
      </div>
    </>
  );
}
