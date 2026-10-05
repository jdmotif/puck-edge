import type { ReactNode } from "react";
import type { GameCard, Pick, TeamSide } from "@/lib/picks";
import { LocalTime } from "./LocalTime";
import { PickCard } from "./PickCard";
import { ProbBar } from "./ProbBar";
import { Card, Pill, TeamLogo } from "./ui";
import { pct, svPct } from "@/lib/format";

export function betHref(card: GameCard, p: Pick) {
  const q = new URLSearchParams({
    game: String(card.game.id),
    date: card.game.startTimeUTC.slice(0, 10),
    gameLabel: `${card.away.abbrev} @ ${card.home.abbrev}`,
    market: p.market,
    selection: p.selection,
    label: p.label,
    ...(p.line !== null ? { line: String(p.line) } : {}),
    ...(p.odds ? { odds: p.odds.toFixed(3) } : {}),
    prob: p.modelProb.toFixed(4),
  });
  return `/bets?${q}`;
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

function Rest({ t }: { t: TeamSide }) {
  if (t.backToBack) return <span className="font-semibold text-warn">Back-to-back</span>;
  return <>{t.restDays !== null ? `${t.restDays}d` : "–"}</>;
}

function Goalie({ t }: { t: TeamSide }) {
  return (
    <span title={`${t.goalie.name} (${t.goalie.status})`}>
      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${t.goalie.status === "confirmed" ? "bg-good" : "bg-muted"}`} />
      <span className="sm:hidden">{t.goalie.name.split(" ").slice(-1)[0]}</span>
      <span className="hidden sm:inline">{t.goalie.name}</span>
      {t.goalie.savePct !== null && <span className="tabular text-muted"> {svPct(t.goalie.savePct)}</span>}
    </span>
  );
}

export function GameCardView({ card, showAll = false }: { card: GameCard; showAll?: boolean }) {
  const g = card.game;
  const final = card.live?.status.startsWith("Final");
  return (
    <Card className="card-hover space-y-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">
          <span className="font-semibold text-ink-2"><LocalTime iso={g.startTimeUTC} /></span> · {g.venue.default}
        </span>
        {card.live ? (
          <Pill tone={final ? "neutral" : "bad"}>{!final && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bad" />}{card.live.status}</Pill>
        ) : g.gameType === 1 ? (
          <Pill>Preseason</Pill>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <TeamHead t={card.away} home={false} />
        <div className="shrink-0 px-1 text-center">
          {card.live ? (
            <div className="font-display tabular text-3xl font-bold">{card.live.away}<span className="px-1 text-muted">–</span>{card.live.home}</div>
          ) : (
            <div className="font-display text-xl font-bold text-muted" title="Away @ home">@</div>
          )}
        </div>
        <TeamHead t={card.home} home />
      </div>

      <ProbBar away={card.away.winProb} home={card.home.winProb} awayLabel={card.away.abbrev} homeLabel={card.home.abbrev} />

      <div className="divide-y divide-line rounded-xl bg-surface-2/50 px-3">
        <Compare label="Last 10" away={card.away.l10} home={card.home.l10} />
        <Compare label="Streak" away={card.away.streak} home={card.home.streak} />
        <Compare label="Rest" away={<Rest t={card.away} />} home={<Rest t={card.home} />} />
        <Compare label="Goalie" away={<Goalie t={card.away} />} home={<Goalie t={card.home} />} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Proj. total", card.prediction.expTotal.toFixed(2)],
          ["OT chance", pct(card.prediction.regTie)],
          ["Market", card.market.moneyline ? `${card.home.abbrev} ${pct(card.market.moneyline.home.fair)}` : "–"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line px-2 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</div>
            <div className="font-display tabular mt-0.5 text-lg font-bold leading-none">{v}</div>
          </div>
        ))}
      </div>

      {card.best && <PickCard pick={card.best} best betHref={card.locked ? undefined : betHref(card, card.best)} />}
      {card.locked && <p className="text-xs text-muted">Game has started: picks are locked and will be graded after the final.</p>}
      <details open={showAll} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink-2 hover:border-line-strong hover:text-ink [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">All picks, props and why</span>
          <span className="hidden group-open:inline">Hide details</span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <div className="mt-3 space-y-2">
          {card.picks.filter((p) => p !== card.best).map((p) => (
            <PickCard key={p.market + p.selection} pick={p} betHref={card.locked ? undefined : betHref(card, p)} />
          ))}
          {card.propPicks.length > 0 && <h3 className="pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Player props (model only)</h3>}
          {card.propPicks.map((p) => (
            <PickCard key={p.market + p.selection} pick={p} betHref={card.locked ? undefined : betHref(card, p)} />
          ))}
          {card.uncertainty.length > 0 && (
            <ul className="space-y-0.5 rounded-xl bg-warn/5 px-3 py-2 text-xs text-ink-2">
              {card.uncertainty.map((u) => <li key={u}><span className="text-warn">⚠</span> {u}</li>)}
            </ul>
          )}
          <a href={`/game/${g.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-2 hover:underline">Full preview →</a>
        </div>
      </details>
    </Card>
  );
}
