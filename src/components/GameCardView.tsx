import type { ReactNode } from "react";
import { TOTALS_PICKS, leanOf, type GameCard, type Pick, type TeamSide } from "@/lib/picks";
import { LocalTime } from "./LocalTime";
import { PickCard, type PickChangeNote } from "./PickCard";
import { ProbBar } from "./ProbBar";
import { Card, Pill, TeamLogo } from "./ui";
import { getI18n } from "@/lib/i18n/server";
import { pickLabel, type I18n } from "@/lib/i18n";

export function betHref(card: GameCard, p: Pick) {
  const q = new URLSearchParams({
    game: String(card.game.id),
    date: card.game.startTimeUTC.slice(0, 10),
    gameLabel: `${card.away.abbrev} @ ${card.home.abbrev}`,
    market: p.market,
    selection: p.selection,
    label: p.logLabel,
    labelText: p.label,
    ...(p.line !== null ? { line: String(p.line) } : {}),
    ...(p.odds ? { odds: p.odds.toFixed(3) } : {}),
    prob: (p.blendProb ?? p.modelProb).toFixed(4),
  });
  return `/bets?${q}`;
}

/** The latest pre-game switch that led to this pick, if it's still the current one. */
function changeNote(card: GameCard, p: Pick, best: boolean, i: I18n): PickChangeNote | undefined {
  const c = card.changes.find((x) => (best ? x.market === "best" : x.market === p.market));
  if (!c || c.to.market !== p.market || c.to.selection !== p.selection || c.to.line !== p.line) return undefined;
  const W = i.t.pick.why;
  return {
    at: new Date(c.at).toISOString(),
    from: pickLabel(i.t, c.from.market, c.from.selection, c.from.line, c.from.label),
    why: c.reasons.map((r) => (r.kind === "goalie" ? W.goalie(r.team, r.name) : W[r.kind])),
  };
}

/** "W3" → "V3" in French. */
export function streak(s: string, i: I18n) {
  const m = /^(W|L|OT)(\d+)$/.exec(s);
  return m ? i.t.stats.streak(m[1], Number(m[2])) : s;
}

function TeamHead({ t, home }: { t: TeamSide; home: boolean }) {
  return (
    <a href={`/teams/${t.abbrev}`} className={`group flex min-w-0 flex-1 items-center gap-3 ${home ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo abbrev={t.abbrev} size={52} />
      <div className="min-w-0">
        <div className="font-display text-2xl font-bold uppercase leading-none tracking-wide group-hover:text-accent-2">{t.abbrev}</div>
        <div className="mt-1 truncate text-xs text-ink-2">{t.name}</div>
        <div className="tabular text-xs text-muted">{t.record}</div>
      </div>
    </a>
  );
}

/** One comparison line: away value · label · home value. */
function Compare({ label, away, home }: { label: string; away: ReactNode; home: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5 text-xs">
      <div className="min-w-0 truncate text-ink-2">{away}</div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="min-w-0 truncate text-right text-ink-2">{home}</div>
    </div>
  );
}

function Rest({ t, i }: { t: TeamSide; i: I18n }) {
  if (t.backToBack) return <span className="font-semibold text-warn">{i.t.card.backToBack}</span>;
  return <>{t.restDays !== null ? i.t.card.restDays(t.restDays) : "–"}</>;
}

function Goalie({ t, i }: { t: TeamSide; i: I18n }) {
  return (
    <span title={`${t.goalie.name} (${i.t.card.goalieStatus[t.goalie.status]})`}>
      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${t.goalie.status === "confirmed" ? "bg-good" : "bg-muted"}`} />
      <span className="sm:hidden">{t.goalie.name.split(" ").slice(-1)[0]}</span>
      <span className="hidden sm:inline">{t.goalie.name}</span>
      {t.goalie.savePct !== null && <span className="tabular text-muted"> {i.f.svPct(t.goalie.savePct)}</span>}
    </span>
  );
}

export async function GameCardView({ card, showAll = false }: { card: GameCard; showAll?: boolean }) {
  const i = await getI18n();
  const { t, f } = i;
  const g = card.game;
  const final = card.live?.status.startsWith("Final");
  // No positive-value bet: still show which side the model prefers, marked as a lean with no bet link.
  const lean = card.best ? null : leanOf(card.picks);
  return (
    <Card className="card-hover space-y-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">
          <span className="font-semibold text-ink-2"><LocalTime iso={g.startTimeUTC} /></span> · {g.venue.default}
        </span>
        {card.live ? (
          <Pill tone={final ? "neutral" : "bad"}>{!final && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bad" />}{card.live.status}</Pill>
        ) : g.gameType === 1 ? (
          <Pill>{t.common.preseason}</Pill>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <TeamHead t={card.away} home={false} />
        <div className="shrink-0 px-1 text-center">
          {card.live ? (
            <div className="font-display tabular text-3xl font-bold">{card.live.away}<span className="px-1 text-muted">–</span>{card.live.home}</div>
          ) : (
            <div className="font-display text-xl font-bold text-muted" title={t.card.awayAtHome}>@</div>
          )}
        </div>
        <TeamHead t={card.home} home />
      </div>

      <ProbBar away={card.away.winProb} home={card.home.winProb} awayLabel={t.card.win(card.away.abbrev)} homeLabel={t.card.win(card.home.abbrev)} awayPct={f.pct(card.away.winProb)} homePct={f.pct(card.home.winProb)} aria={t.card.winAria(card.away.abbrev, f.pct(card.away.winProb), card.home.abbrev, f.pct(card.home.winProb))} />

      <div className="divide-y divide-line rounded-xl bg-surface-2/50 px-3">
        <Compare label={t.card.last10} away={card.away.l10} home={card.home.l10} />
        <Compare label={t.card.streak} away={streak(card.away.streak, i)} home={streak(card.home.streak, i)} />
        <Compare label={t.card.rest} away={<Rest t={card.away} i={i} />} home={<Rest t={card.home} i={i} />} />
        <Compare label={t.card.goalie} away={<Goalie t={card.away} i={i} />} home={<Goalie t={card.home} i={i} />} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [t.card.projTotal, f.num(card.prediction.expTotal, 2)],
          [t.card.otChance, f.pct(card.prediction.regTie)],
          [t.card.market, card.market.moneyline ? `${card.home.abbrev} ${f.pct(card.market.moneyline.home.fair)}` : "–"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line px-2 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</div>
            <div className="font-display tabular mt-0.5 text-lg font-bold leading-none">{v}</div>
          </div>
        ))}
      </div>

      {card.best && <PickCard pick={card.best} best betHref={card.locked ? undefined : betHref(card, card.best)} change={changeNote(card, card.best, true, i)} />}
      {lean && <PickCard pick={lean} lean />}
      {!card.best && !card.locked && (
        <p className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5 text-sm text-ink-2">{card.picks.length ? t.card.noEdge : t.card.noPrice}</p>
      )}
      {card.locked && <p className="text-xs text-muted">{t.card.locked}</p>}
      <details open={showAll} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink-2 hover:border-line-strong hover:text-ink [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">{t.card.showAll}</span>
          <span className="hidden group-open:inline">{t.card.hide}</span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <div className="mt-3 space-y-2">
          {card.picks.filter((p) => p !== card.best && p !== lean).map((p) => (
            <PickCard key={p.market + p.selection} pick={p} betHref={card.locked ? undefined : betHref(card, p)} change={changeNote(card, p, false, i)} />
          ))}
          {!TOTALS_PICKS && <p className="text-xs text-muted">{t.card.totalsPaused}</p>}
          {card.propPicks.length > 0 && <h3 className="pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t.card.props}</h3>}
          {card.propPicks.map((p) => (
            <PickCard key={p.market + p.selection} pick={p} betHref={card.locked ? undefined : betHref(card, p)} />
          ))}
          {card.uncertainty.length > 0 && (
            <ul className="space-y-0.5 rounded-xl bg-warn/5 px-3 py-2 text-xs text-ink-2">
              {card.uncertainty.map((u) => <li key={u}><span className="text-warn">⚠</span> {u}</li>)}
            </ul>
          )}
          <a href={`/game/${g.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-2 hover:underline">{t.card.fullPreview}</a>
        </div>
      </details>
    </Card>
  );
}
