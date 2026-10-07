"use client";
import type { ReactNode } from "react";
import { american } from "@/lib/format";
import type { BetRow } from "@/lib/bankroll-math";
import type { Settings } from "@/lib/settings-shared";
import { ODDS_BANDS, currentStreak, groupBy, maxDrawdown, oddsBand, settledBets, statsOf, type GroupStats, type flatUnits } from "@/lib/roi";
import type { Market } from "@/lib/outcome";
import { BankrollChart } from "@/components/BankrollChart";
import { Card, Empty, SectionTitle, StatTile } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { pickLabel } from "@/lib/i18n";

type Flat = ReturnType<typeof flatUnits> & { key: string };
export interface ModelRecord {
  periods: Flat[];
  markets: Flat[];
}

function Table({ title, rows, label }: { title: string; rows: GroupStats[]; label: (k: string) => ReactNode }) {
  const { t, f } = useI18n();
  const C = t.roi.cols;
  return (
    <Card className="overflow-x-auto !p-0">
      <h2 className="px-4 pt-4 font-display text-lg font-bold uppercase tracking-wide">{title}</h2>
      <table className="tabular mt-2 w-full min-w-[420px] text-sm [&_td]:whitespace-nowrap">
        <thead className="text-xs text-muted">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left">
            <th /><th>{C.bets}</th><th>{C.record}</th><th>{C.staked}</th><th>{C.profit}</th><th>{C.roi}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
              <td className="!whitespace-normal !text-left">{label(r.key)}</td>
              <td>{r.n}</td>
              <td className="text-ink-2">{r.w}-{r.l}-{r.p}</td>
              <td className="text-ink-2">{f.money(r.staked)}</td>
              <td className={r.profit > 0 ? "text-good" : r.profit < 0 ? "text-bad" : ""}>{f.money(r.profit)}</td>
              <td className={r.roi !== null && r.roi > 0 ? "text-good" : r.roi !== null && r.roi < 0 ? "text-bad" : ""}>{r.roi === null ? "–" : f.signedPct(r.roi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function RoiView({ bets, settings, model }: { bets: BetRow[]; settings: Settings; model: ModelRecord }) {
  const { t, f } = useI18n();
  const R = t.roi;
  const settled = settledBets(bets);
  const all = statsOf(settled);
  const unit = settings.startingBankroll / 100;
  const decided = all.w + all.l;
  const priced = settled.filter((b) => b.status !== "void");
  const avgOdds = priced.length ? priced.reduce((s, b) => s + b.oddsDecimal, 0) / priced.length : null;
  const streak = currentStreak(settled);
  let run = settings.startingBankroll;
  const curve = settled.map((b) => {
    run += b.profit ?? 0;
    return { t: b.settledAt ?? 0, v: run, label: `${b.gameDate} ${pickLabel(t, b.market, b.selection, b.line, b.selectionLabel)} (${t.bets.status[b.status] ?? b.status})` };
  });
  const tone = (x: number | null) => (x === null || x === 0 ? undefined : x > 0 ? "good" : "bad") as "good" | "bad" | undefined;
  const months = groupBy(settled, (b) => b.gameDate.slice(0, 7)).sort((a, b) => (a.key < b.key ? 1 : -1));
  const bands = groupBy(settled, (b) => oddsBand(b.oddsDecimal)).sort((a, b) => ODDS_BANDS.indexOf(a.key) - ODDS_BANDS.indexOf(b.key));

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle action={<a href="/bets" className="text-xs font-medium text-accent-2 hover:underline">{R.logBets}</a>}>{R.yours}</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label={R.bankroll} value={f.money(run)} hint={`${t.bets.start} ${f.money(settings.startingBankroll)}`} />
          <StatTile label={R.profit} value={f.money(all.profit)} tone={tone(all.profit)} />
          <StatTile label={R.roi} value={all.roi === null ? "–" : f.signedPct(all.roi)} tone={tone(all.roi)} hint={R.roiHint(f.money(all.staked))} />
          <StatTile label={R.units} value={`${all.profit >= 0 ? "+" : "−"}${f.num(Math.abs(all.profit / unit), 1)}`} tone={tone(all.profit)} hint={R.unitsHint(f.money(unit))} />
          <StatTile label={R.record} value={`${all.w}-${all.l}-${all.p}`} hint={decided ? R.winRate(f.pct(all.w / decided)) : undefined} />
          <StatTile label={R.avgOdds} value={avgOdds ? american(avgOdds) : "–"} hint={avgOdds ? f.decimal(avgOdds) : undefined} />
          <StatTile label={R.drawdown} value={f.money(maxDrawdown(settled, settings.startingBankroll))} hint={R.drawdownHint} />
          <StatTile label={R.streak} value={streak ? R.streakText(streak.won, streak.n) : "–"} tone={streak ? (streak.won ? "good" : "bad") : undefined} />
        </div>
      </section>

      {settled.length === 0 ? (
        <Empty>{R.none}</Empty>
      ) : (
        <>
          <Card>
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{R.bankroll}</h2>
            <BankrollChart points={curve} start={settings.startingBankroll} />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Table title={R.byMarket} rows={groupBy(settled, (b) => b.market)} label={(k) => t.markets[k as Market] ?? k} />
            <Table title={R.byOdds} rows={bands} label={(k) => R.bands[k]} />
            <Table title={R.byMonth} rows={months} label={(k) => f.day(`${k}-15`, { month: "long", year: "numeric" })} />
          </div>
        </>
      )}

      <section>
        <SectionTitle>{R.model}</SectionTitle>
        <p className="-mt-1 mb-3 text-sm text-muted">{R.modelSub}</p>
        {model.periods.at(-1)!.n === 0 ? (
          <Empty>{R.modelNone}</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {model.periods.map((p) => (
              <StatTile
                key={p.key}
                label={R.periods[p.key]}
                value={`${p.units >= 0 ? "+" : "−"}${f.num(Math.abs(p.units), 2)} u`}
                tone={p.n ? tone(p.units) : undefined}
                hint={p.n ? `${p.w}-${p.l}-${p.p} · ${p.roi === null ? "–" : f.signedPct(p.roi)} ${R.roi}` : R.modelNone}
              />
            ))}
          </div>
        )}
        {model.markets.length > 1 && (
          <p className="mt-3 text-xs text-muted tabular">
            {model.markets.map((m) => `${t.markets[m.key as Market] ?? m.key}: ${m.w}-${m.l}-${m.p}, ${m.units >= 0 ? "+" : "−"}${f.num(Math.abs(m.units), 2)} u`).join(" · ")}
          </p>
        )}
      </section>
    </div>
  );
}
