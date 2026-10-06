"use client";
import type { Market } from "@/lib/outcome";
import { bankrollOf, lossLimits, type BetRow } from "@/lib/bankroll-math";
import type { Settings } from "@/lib/settings-shared";
import { BankrollChart } from "@/components/BankrollChart";
import { Card, Empty, Pill, StatTile } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { pickLabel } from "@/lib/i18n";
import { clv, summarizeClv } from "@/lib/clv";
import { BetForm, type GameOption } from "./BetForm";
import { deleteBet } from "./actions";

/**
 * The bet tracker. The server page passes bets from SQLite; the static site passes bets from this
 * browser along with `onAdd` / `onDelete` handlers instead of the server actions.
 */
export function BetsView({ bets, settings, games, prefill, flash, onAdd, onDelete }: {
  bets: BetRow[];
  settings: Settings;
  games: GameOption[];
  prefill: Record<string, string | undefined>;
  flash: { error?: string; added?: boolean };
  onAdd?: (form: FormData) => void;
  onDelete?: (id: number) => void;
}) {
  const { t, f } = useI18n();
  const B = t.bets;
  const bankroll = bankrollOf(bets, settings);
  const limits = lossLimits(bets, settings);
  const settled = bets.filter((b) => b.status !== "open").sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0));
  const staked = settled.filter((b) => b.status !== "void").reduce((s, b) => s + b.stake, 0);
  const profit = settled.reduce((s, b) => s + (b.profit ?? 0), 0);
  const won = settled.filter((b) => b.status === "won").length;
  const lost = settled.filter((b) => b.status === "lost").length;
  let run = settings.startingBankroll;
  const curve = settled.map((b) => {
    run += b.profit ?? 0;
    return { t: b.settledAt ?? 0, v: run, label: `${b.gameDate} ${pickLabel(t, b.market, b.selection, b.line, b.selectionLabel)} (${B.status[b.status] ?? b.status})` };
  });
  const open = bets.filter((b) => b.status === "open");
  const closing = summarizeClv(bets.filter((b) => b.status !== "void").map((b) => ({ odds: b.oddsDecimal, closingProb: b.closingProb ?? null })));

  return (
    <>
      {flash.error && <div className="mb-3 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">{flash.error === "missing" ? B.missing : flash.error}</div>}
      {flash.added && <div className="mb-3 rounded-xl border border-good/40 bg-good/10 px-4 py-2.5 text-sm text-good">{B.added}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          [B.bankroll, f.money(bankroll)],
          [B.pnl, f.money(profit)],
          [B.roi, staked ? f.pct(profit / staked, 1) : "–"],
          [B.record, `${won}-${lost}`],
          [B.open, `${open.length} · ${f.money(open.reduce((s, b) => s + b.stake, 0))}`],
        ].map(([k, v]) => (
          <StatTile key={k} label={k} value={v} tone={k === B.pnl ? (profit > 0 ? "good" : profit < 0 ? "bad" : undefined) : undefined} />
        ))}
        <StatTile
          label={B.clv}
          value={closing.beat === null ? "–" : f.pct(closing.beat)}
          hint={closing.avg === null ? undefined : B.clvHint(f.signedPct(closing.avg), closing.n)}
          tone={closing.avg === null ? undefined : closing.avg >= 0 ? "good" : "bad"}
        />
      </div>
      <p className="mb-4 text-xs text-muted tabular">
        {B.todayLine(f.money(limits.day), settings.dailyLossLimit ? f.money(settings.dailyLossLimit, 0) : null)} · {B.weekLine(f.money(limits.week), settings.weeklyLossLimit ? f.money(settings.weeklyLossLimit, 0) : null)} · <a className="text-accent-2" href="/settings">{B.limitsLink}</a>
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-wide">{B.logTitle}</h2>
          <BetForm games={games} prefill={prefill} bankroll={bankroll} kelly={settings.kellyFraction} cap={settings.maxStakePct} onAdd={onAdd} />
        </Card>
        <Card>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{B.bankroll}</h2>
          {curve.length ? <BankrollChart points={curve} start={settings.startingBankroll} /> : <Empty>{B.chartEmpty}</Empty>}
        </Card>
      </div>

      <Card className="mt-4 overflow-x-auto !p-0">
        <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">{B.history}</h2>
        {bets.length ? (
          <table className="tabular mt-2 w-full min-w-[720px] text-sm">
            <thead className="text-xs text-muted">
              <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left"><th>{B.cols.date}</th><th>{B.cols.game}</th><th>{B.cols.bet}</th><th>{B.cols.odds}</th><th>{B.cols.close}</th><th>{B.cols.stake}</th><th>{B.cols.status}</th><th>{B.cols.pnl}</th><th></th></tr>
            </thead>
            <tbody>
              {bets.map((b) => (
                <tr key={b.id} className="border-t border-line [&>td]:px-2 [&>td]:py-2">
                  <td className="text-muted">{b.gameDate}</td>
                  <td><a className="hover:text-accent-2" href={`/game/${b.gameId}`}>{b.gameLabel}</a></td>
                  <td>{pickLabel(t, b.market, b.selection, b.line, b.selectionLabel)} <span className="text-xs text-muted">{t.markets[b.market as Market] ?? b.market}</span></td>
                  <td>{f.american(b.oddsDecimal)} <span className="text-xs text-muted">({f.decimal(b.oddsDecimal)})</span></td>
                  <td>
                    {b.closingOdds && b.closingProb ? (
                      <>{f.american(b.closingOdds)} <span className={`text-xs ${clv(b.oddsDecimal, b.closingProb) >= 0 ? "text-good" : "text-bad"}`}>{f.signedPct(clv(b.oddsDecimal, b.closingProb))}</span></>
                    ) : "–"}
                  </td>
                  <td>{f.money(b.stake)}</td>
                  <td><Pill tone={b.status === "won" ? "good" : b.status === "lost" ? "bad" : b.status === "open" ? "accent" : "neutral"}>{B.status[b.status] ?? b.status}</Pill></td>
                  <td className={(b.profit ?? 0) > 0 ? "text-good" : (b.profit ?? 0) < 0 ? "text-bad" : ""}>{b.profit === null ? "–" : f.money(b.profit)}</td>
                  <td>
                    {onDelete ? (
                      <button type="button" onClick={() => onDelete(b.id)} className="text-xs text-muted hover:text-bad" aria-label={B.delAria}>{B.del}</button>
                    ) : (
                      <form action={deleteBet}><input type="hidden" name="id" value={b.id} /><button className="text-xs text-muted hover:text-bad" aria-label={B.delAria}>{B.del}</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="p-3 text-sm text-muted">{B.none}</p>}
      </Card>
    </>
  );
}
