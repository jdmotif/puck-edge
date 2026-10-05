import { api, todayIso } from "@/lib/nhl/client";
import { listBets, bankrollNow, lossLimitStatus } from "@/lib/data/bankroll";
import { settleBets, type Market } from "@/lib/grading";
import { getSettings } from "@/lib/settings";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import { BankrollChart } from "@/components/BankrollChart";
import { Card, Empty, PageTitle, Pill, StatTile } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { pickLabel } from "@/lib/i18n";
import { BetForm, type GameOption } from "./BetForm";
import { deleteBet } from "./actions";

export const dynamic = "force-dynamic";

export default async function BetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  refreshRecentInBackground();
  settleBets();
  const sp = await searchParams;
  const { t, f } = await getI18n();
  const B = t.bets;
  const settings = getSettings();
  const bets = listBets();
  const bankroll = bankrollNow();
  const limits = lossLimitStatus();
  const sched = await api.schedule(todayIso());
  const games: GameOption[] = (sched.data?.gameWeek ?? []).flatMap((d) =>
    d.games
      .filter((g) => g.gameState === "FUT" || g.gameState === "PRE" || g.gameState === "LIVE" || g.gameState === "CRIT")
      .map((g) => ({ id: g.id, date: d.date, label: `${g.awayTeam.abbrev} @ ${g.homeTeam.abbrev}`, home: g.homeTeam.abbrev, away: g.awayTeam.abbrev })),
  );

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

  return (
    <>
      <PageTitle sub={B.sub}>{B.title}</PageTitle>
      {sp.error && <div className="mb-3 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">{sp.error === "missing" ? B.missing : sp.error}</div>}
      {sp.added && <div className="mb-3 rounded-xl border border-good/40 bg-good/10 px-4 py-2.5 text-sm text-good">{B.added}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[
          [B.bankroll, f.money(bankroll)],
          [B.pnl, f.money(profit)],
          [B.roi, staked ? f.pct(profit / staked, 1) : "–"],
          [B.record, `${won}-${lost}`],
          [B.open, `${open.length} · ${f.money(open.reduce((s, b) => s + b.stake, 0))}`],
        ].map(([k, v]) => (
          <StatTile key={k} label={k} value={v} tone={k === B.pnl ? (profit > 0 ? "good" : profit < 0 ? "bad" : undefined) : undefined} />
        ))}
      </div>
      <p className="mb-4 text-xs text-muted tabular">
        {B.todayLine(f.money(limits.day), settings.dailyLossLimit ? f.money(settings.dailyLossLimit, 0) : null)} · {B.weekLine(f.money(limits.week), settings.weeklyLossLimit ? f.money(settings.weeklyLossLimit, 0) : null)} · <a className="text-accent-2" href="/settings">{B.limitsLink}</a>
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-wide">{B.logTitle}</h2>
          <BetForm games={games} prefill={sp} bankroll={bankroll} kelly={settings.kellyFraction} cap={settings.maxStakePct} />
        </Card>
        <Card>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{B.bankroll}</h2>
          {curve.length ? <BankrollChart points={curve} start={settings.startingBankroll} /> : <Empty>{B.chartEmpty}</Empty>}
        </Card>
      </div>

      <Card className="mt-4 overflow-x-auto !p-0">
        <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">{B.history}</h2>
        {bets.length ? (
          <table className="tabular mt-2 w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted">
              <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left"><th>{B.cols.date}</th><th>{B.cols.game}</th><th>{B.cols.bet}</th><th>{B.cols.odds}</th><th>{B.cols.stake}</th><th>{B.cols.status}</th><th>{B.cols.pnl}</th><th></th></tr>
            </thead>
            <tbody>
              {bets.map((b) => (
                <tr key={b.id} className="border-t border-line [&>td]:px-2 [&>td]:py-2">
                  <td className="text-muted">{b.gameDate}</td>
                  <td><a className="hover:text-accent-2" href={`/game/${b.gameId}`}>{b.gameLabel}</a></td>
                  <td>{pickLabel(t, b.market, b.selection, b.line, b.selectionLabel)} <span className="text-xs text-muted">{t.markets[b.market as Market] ?? b.market}</span></td>
                  <td>{f.american(b.oddsDecimal)} <span className="text-xs text-muted">({f.decimal(b.oddsDecimal)})</span></td>
                  <td>{f.money(b.stake)}</td>
                  <td><Pill tone={b.status === "won" ? "good" : b.status === "lost" ? "bad" : b.status === "open" ? "accent" : "neutral"}>{B.status[b.status] ?? b.status}</Pill></td>
                  <td className={(b.profit ?? 0) > 0 ? "text-good" : (b.profit ?? 0) < 0 ? "text-bad" : ""}>{b.profit === null ? "–" : f.money(b.profit)}</td>
                  <td>
                    <form action={deleteBet}><input type="hidden" name="id" value={b.id} /><button className="text-xs text-muted hover:text-bad" aria-label={B.delAria}>{B.del}</button></form>
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
