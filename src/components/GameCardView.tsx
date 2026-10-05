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

function TeamRow({ t, home }: { t: TeamSide; home: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <TeamLogo abbrev={t.abbrev} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <a href={`/teams/${t.abbrev}`} className="font-semibold hover:text-accent">{t.name}</a>
          <span className="tabular text-sm text-ink-2">{t.record}</span>
          {home && <span className="text-xs text-muted">home</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2">
          <span>L10 {t.l10}</span>
          <span>Streak {t.streak}</span>
          {t.restDays !== null && !t.backToBack && <span>{t.restDays}d rest</span>}
          {t.backToBack && <span className="font-medium text-warn">Back-to-back</span>}
        </div>
        <div className="mt-0.5 text-xs text-ink-2">
          <span className="text-muted">G: </span>
          {t.goalie.name}
          {t.goalie.savePct !== null && <> · {svPct(t.goalie.savePct)}</>}
          {t.goalie.gaa !== null && <> · {t.goalie.gaa.toFixed(2)} GAA</>}
          <span className={`ml-1 ${t.goalie.status === "confirmed" ? "text-good" : "text-muted"}`}>({t.goalie.status})</span>
        </div>
      </div>
    </div>
  );
}

export function GameCardView({ card, showAll = false }: { card: GameCard; showAll?: boolean }) {
  const g = card.game;
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          <LocalTime iso={g.startTimeUTC} /> · {g.venue.default}
        </span>
        {card.live ? (
          <Pill tone={card.live.status.startsWith("Final") ? "neutral" : "bad"}>
            {card.away.abbrev} {card.live.away}–{card.live.home} {card.home.abbrev} · {card.live.status}
          </Pill>
        ) : g.gameType === 1 ? (
          <Pill>Preseason</Pill>
        ) : null}
      </div>
      <TeamRow t={card.away} home={false} />
      <TeamRow t={card.home} home />
      <ProbBar away={card.away.winProb} home={card.home.winProb} awayLabel={card.away.abbrev} homeLabel={card.home.abbrev} />
      <div className="flex flex-wrap gap-x-4 text-xs text-ink-2 tabular">
        <span>Projected total <span className="font-semibold text-ink">{card.prediction.expTotal.toFixed(2)}</span></span>
        <span>OT chance {pct(card.prediction.regTie)}</span>
        {card.market.moneyline && (
          <span>Market {card.home.abbrev} {pct(card.market.moneyline.home.fair)}</span>
        )}
      </div>
      {card.best && <PickCard pick={card.best} best betHref={card.locked ? undefined : betHref(card, card.best)} />}
      {card.locked && <p className="text-xs text-muted">Game has started: picks are locked and will be graded after the final.</p>}
      <details open={showAll} className="group">
        <summary className="cursor-pointer list-none text-sm text-accent">
          <span className="group-open:hidden">All picks, props and why ↓</span>
          <span className="hidden group-open:inline">Hide ↑</span>
        </summary>
        <div className="mt-2 space-y-2">
          {card.picks.filter((p) => p !== card.best).map((p) => (
            <PickCard key={p.market + p.selection} pick={p} betHref={card.locked ? undefined : betHref(card, p)} />
          ))}
          {card.propPicks.length > 0 && <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Player props (model only)</h3>}
          {card.propPicks.map((p) => (
            <PickCard key={p.market + p.selection} pick={p} betHref={card.locked ? undefined : betHref(card, p)} />
          ))}
          {card.uncertainty.length > 0 && (
            <ul className="text-xs text-muted">
              {card.uncertainty.map((u) => <li key={u}>⚠ {u}</li>)}
            </ul>
          )}
          <a href={`/game/${g.id}`} className="inline-block text-sm text-accent">Full preview →</a>
        </div>
      </details>
    </Card>
  );
}
