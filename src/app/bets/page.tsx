import { api, todayIso } from "@/lib/nhl/client";
import { listBets, bankrollNow, lossLimitStatus } from "@/lib/data/bankroll";
import { settleBets, MARKET_LABELS, type Market } from "@/lib/grading";
import { getSettings } from "@/lib/settings";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import { BankrollChart } from "@/components/BankrollChart";
import { Card, Empty, PageTitle, Pill, StatTile } from "@/components/ui";
import { american, money, pct } from "@/lib/format";
import { BetForm, type GameOption } from "./BetForm";
import { deleteBet } from "./actions";

export const dynamic = "force-dynamic";

export default async function BetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  refreshRecentInBackground();
  settleBets();
  const sp = await searchParams;
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
    return { t: b.settledAt ?? 0, v: run, label: `${b.gameDate} ${b.selectionLabel} (${b.status})` };
  });
  const open = bets.filter((b) => b.status === "open");

  return (
    <>
      <PageTitle sub="Bets settle automatically from final scores.">My bets</PageTitle>
      {sp.error && <div className="mb-3 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">{sp.error}</div>}
      {sp.added && <div className="mb-3 rounded-xl border border-good/40 bg-good/10 px-4 py-2.5 text-sm text-good">Bet logged.</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[
          ["Bankroll", money(bankroll)],
          ["P&L", money(profit)],
          ["ROI", staked ? pct(profit / staked, 1) : "–"],
          ["Record", `${won}-${lost}`],
          ["Open bets", `${open.length} · ${money(open.reduce((s, b) => s + b.stake, 0))}`],
        ].map(([k, v]) => (
          <StatTile key={k} label={k} value={v} tone={k === "P&L" ? (profit > 0 ? "good" : profit < 0 ? "bad" : undefined) : undefined} />
        ))}
      </div>
      <p className="mb-4 text-xs text-muted tabular">
        Today {money(limits.day)}{settings.dailyLossLimit ? ` (limit −$${settings.dailyLossLimit})` : ""} · This week {money(limits.week)}{settings.weeklyLossLimit ? ` (limit −$${settings.weeklyLossLimit})` : ""} · <a className="text-accent-2" href="/settings">Limits &amp; staking settings</a>
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-wide">Log a bet</h2>
          <BetForm games={games} prefill={sp} bankroll={bankroll} kelly={settings.kellyFraction} cap={settings.maxStakePct} />
        </Card>
        <Card>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Bankroll</h2>
          {curve.length ? <BankrollChart points={curve} start={settings.startingBankroll} /> : <Empty>Your bankroll chart appears after the first bet settles.</Empty>}
        </Card>
      </div>

      <Card className="mt-4 overflow-x-auto !p-0">
        <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">History</h2>
        {bets.length ? (
          <table className="tabular mt-2 w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted">
              <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left"><th>Date</th><th>Game</th><th>Bet</th><th>Odds</th><th>Stake</th><th>Status</th><th>P&amp;L</th><th></th></tr>
            </thead>
            <tbody>
              {bets.map((b) => (
                <tr key={b.id} className="border-t border-line [&>td]:px-2 [&>td]:py-2">
                  <td className="text-muted">{b.gameDate}</td>
                  <td><a className="hover:text-accent-2" href={`/game/${b.gameId}`}>{b.gameLabel}</a></td>
                  <td>{b.selectionLabel}{b.line !== null && b.market !== "total" ? ` ${b.line > 0 ? "+" : ""}${b.line}` : b.line !== null ? ` ${b.line}` : ""} <span className="text-xs text-muted">{MARKET_LABELS[b.market as Market] ?? b.market}</span></td>
                  <td>{american(b.oddsDecimal)}</td>
                  <td>{money(b.stake)}</td>
                  <td><Pill tone={b.status === "won" ? "good" : b.status === "lost" ? "bad" : b.status === "open" ? "accent" : "neutral"}>{b.status}</Pill></td>
                  <td className={(b.profit ?? 0) > 0 ? "text-good" : (b.profit ?? 0) < 0 ? "text-bad" : ""}>{b.profit === null ? "–" : money(b.profit)}</td>
                  <td>
                    <form action={deleteBet}><input type="hidden" name="id" value={b.id} /><button className="text-xs text-muted hover:text-bad" aria-label="Delete bet">Delete</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="p-3 text-sm text-muted">No bets logged yet.</p>}
      </Card>
    </>
  );
}
