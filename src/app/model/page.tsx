import { sqlite } from "@/db";
import { calibration, brier, logLoss } from "@/lib/model/math";
import { loadMoneylineParams } from "@/lib/model/engine";
import { FEATURE_NAMES } from "@/lib/model/features";
import { MARKET_LABELS, type Market } from "@/lib/grading";
import { CalibrationChart } from "@/components/CalibrationChart";
import { Card, Empty, PageTitle, Pill, Rich } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { pickLabel } from "@/lib/i18n";
import { refreshRecentInBackground } from "@/lib/data/refresh";

export const dynamic = "force-dynamic";

interface Graded { market: Market; selection: string; line: number | null; p: number; odds: number | null; edge: number | null; result: string; isValue: number; isBest: number; label: string; date: string; gameId: number }

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

export default async function ModelPage() {
  refreshRecentInBackground();
  const { t, f } = await getI18n();
  const M = t.model;
  const FEATURE_TEXT = M.features;
  const graded = sqlite
    .prepare(
      `SELECT market, selection, line, model_prob AS p, odds_decimal AS odds, edge, result, is_value AS isValue, is_best AS isBest, selection_label AS label, game_date AS date, game_id AS gameId
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
      <PageTitle sub={M.sub}>{M.title}</PageTitle>

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
                <h2 className="font-display text-lg font-bold uppercase tracking-wide">{t.markets[m]}</h2>
                {losing ? <Pill tone="bad">{M.losing}</Pill> : s.roi !== null && s.priced >= 20 ? <Pill tone="good">{M.profitable}</Pill> : null}
              </div>
              {s.n === 0 ? (
                <p className="mt-2 text-sm text-muted">{M.noGraded}</p>
              ) : (
                <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm tabular">
                  <dt className="text-muted">{M.graded}</dt><dd className="text-right">{s.n}</dd>
                  <dt className="text-muted">{M.hitRate}</dt><dd className="text-right">{f.pct(s.hitRate, 1)} <span className="text-xs text-muted">{M.modelSaid(f.pct(s.expected, 1))}</span></dd>
                  <dt className="text-muted">{M.roi}</dt>
                  <dd className={`text-right ${s.roi === null ? "" : s.roi >= 0 ? "text-good" : "text-bad"}`}>{s.roi === null ? M.noOdds : M.roiLine(f.pct(s.roi, 1), f.units(s.profit), s.priced)}</dd>
                  {v.n > 0 && <><dt className="text-muted">{M.valueOnly}</dt><dd className="text-right">{v.roi === null ? M.valueHit(f.pct(v.hitRate, 1)) : M.valueRoi(f.pct(v.roi, 1), v.priced)}</dd></>}
                </dl>
              )}
              {losing && <p className="mt-2 text-xs text-bad">{M.lostWarn(f.units(s.profit))}</p>}
              {underperf && !losing && <p className="mt-2 text-xs text-warn">{M.underWarn}</p>}
            </Card>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">{M.pending(pending)}</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-display text-lg font-bold uppercase tracking-wide">{M.mlCal}</h2>
          <p className="mb-2 text-xs text-muted">{M.mlCalSub}</p>
          {backtest.length || liveMl.length ? (
            <CalibrationChart series={[
              ...(liveMl.length ? [{ label: M.livePicks(liveMl.length), color: "var(--series-1)", buckets: liveCal }] : []),
              ...(backtest.length ? [{ label: M.backtestHome(backtest.length), color: "var(--series-2)", buckets: btCal }] : []),
            ]} />
          ) : <Empty><Rich text={M.noData} /></Empty>}
          {backtest.length > 0 && (
            <p className="mt-2 text-xs text-ink-2 tabular">
              {M.btLine(logLoss(backtest.map((b) => b.p), backtest.map((b) => b.y)), brier(backtest.map((b) => b.p), backtest.map((b) => b.y)))}
            </p>
          )}
        </Card>
        <Card>
          <h2 className="mb-1 font-display text-lg font-bold uppercase tracking-wide">{M.otherCal}</h2>
          <p className="mb-2 text-xs text-muted">{M.otherCalSub}</p>
          {backtest.length ? (
            <CalibrationChart series={[
              { label: M.over55, color: "var(--series-1)", buckets: btOver },
              { label: M.homeMinus, color: "var(--series-2)", buckets: btPl },
            ]} />
          ) : <Empty>{M.noBacktest}</Empty>}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{M.weights}</h2>
          <p className="mb-2 text-xs text-muted">
            {params.fitted ? M.fitted(params.n, params.logLoss ?? null) : M.prior}
            {" "}{M.positive}
          </p>
          <table className="tabular w-full text-sm">
            <tbody>
              <tr className="border-t border-line"><td className="py-1">{FEATURE_TEXT.homeIce}</td><td className="text-right">{f.num(params.intercept, 3)}</td></tr>
              {FEATURE_NAMES.map((feat, i) => (
                <tr key={feat} className="border-t border-line"><td className="py-1">{FEATURE_TEXT[feat]}</td><td className="text-right">{f.num(params.weights[i], 3)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{M.recent}</h2>
          {graded.length ? (
            <ul className="space-y-1 text-sm">
              {graded.slice(0, 25).map((g, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-20 text-xs text-muted">{g.date}</span>
                  <a href={`/game/${g.gameId}`} className="flex-1 truncate hover:text-accent-2">{pickLabel(t, g.market, g.selection, g.line, g.label)}</a>
                  <span className="tabular text-xs text-ink-2">{f.pct(g.p)}</span>
                  <Pill tone={g.result === "win" ? "good" : g.result === "loss" ? "bad" : "neutral"}>{t.result[g.result] ?? g.result}</Pill>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{M.nothing}</p>}
        </Card>
      </div>
    </>
  );
}
