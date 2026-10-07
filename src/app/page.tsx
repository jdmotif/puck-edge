import { Suspense } from "react";
import { attachChanges, buildSlate, logPicks } from "@/lib/picks";
import { todayIso } from "@/lib/nhl/client";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import { GameCardView, cardState } from "@/components/GameCardView";
import { SlateFilter, type SlateFilterKey } from "@/components/SlateFilter";
import { sqlite } from "@/db";
import type { GameCard, Slate } from "@/lib/picks";
import type { I18n } from "@/lib/i18n";
import { LiveRefresh } from "@/components/LiveScore";
import { ButtonLink, CONFIDENCE_STARS, Empty, PageTitle, Rich, SectionTitle, SkeletonCards, Stars, StatTile, TeamLogo } from "@/components/ui";
import { StaleBanner } from "@/components/StaleBanner";
import { getSettings } from "@/lib/settings";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const shift = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export default async function Tonight({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date = todayIso() } = await searchParams;
  const { t, f } = await getI18n();
  const label = date === todayIso() ? t.tonight.title : f.day(date, { weekday: "long", month: "long", day: "numeric" });
  return (
    <>
      <PageTitle eyebrow={f.day(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}>{label}</PageTitle>
      <DayStrip date={date} />
      <Suspense key={date} fallback={<SkeletonCards n={4} h={300} />}>
        <SlateView date={date} />
      </Suspense>
    </>
  );
}

async function SlateView({ date }: { date: string }) {
  refreshRecentInBackground();
  const i = await getI18n();
  const { t, f, locale } = i;
  const slate = await buildSlate(date, locale);
  if (date >= todayIso()) logPicks(slate);
  else attachChanges(slate);
  const settings = getSettings();
  const valueCount = slate.cards.filter(isValueCard).length;
  const counts: Record<SlateFilterKey, number> = { all: slate.cards.length, value: valueCount, upcoming: 0, live: 0, final: 0 };
  for (const c of slate.cards) counts[cardState(c)]++;
  const record = bestPickRecord(date);
  const topPick = slate.cards.flatMap((c) => c.picks).filter((p) => p.edge !== null).sort((a, b) => b.edge! - a.edge!)[0];
  const topEdge = topPick?.edge ?? null;
  return (
    <>
      <StaleBanner items={slate.sources} />
      <LiveRefresh active={slate.cards.some((c) => c.locked && c.game.gameState !== "OFF" && c.game.gameState !== "FINAL")} />
      {!slate.hasHistory && (
        <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">
          <Rich text={t.tonight.noHistory} />
        </div>
      )}
      {slate.cards.length === 0 ? (
        <Empty>{t.tonight.noGames}</Empty>
      ) : (
        <>
          <BestBets slate={slate} i={i} />
          <div className="-mx-4 mb-5 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4 [&>*]:w-40 [&>*]:shrink-0 sm:[&>*]:w-auto">
            <StatTile label={t.tonight.games} value={slate.cards.length} hint={slate.cards.some((c) => c.live) ? t.tonight.someLive : t.tonight.onSlate} />
            <StatTile label={t.tonight.valuePicks} value={valueCount} tone={valueCount ? "edge" : undefined} hint={t.tonight.edgeAtLeast(settings.edgeThreshold)} />
            <StatTile label={t.tonight.topEdge} value={topEdge !== null ? f.signedPct(topEdge) : "–"} tone={topEdge !== null && topEdge > 0 ? "good" : undefined} hint={topPick ? topPick.label : t.tonight.noPriced} />
            <StatTile
              label={t.tonight.record}
              value={record.n ? `${record.w}-${record.l}` : "–"}
              tone={record.n ? (record.units >= 0 ? "good" : "bad") : undefined}
              hint={record.n ? t.tonight.recordHint(record.units, record.n) : t.tonight.noRecord}
            />
          </div>
          <SlateFilter counts={counts} labels={t.tonight.filters} aria={t.tonight.filterAria}>
            {slate.cards.map((c) => (
              <div key={c.game.id} id={`g${c.game.id}`} data-card data-state={cardState(c)} data-value={isValueCard(c) ? "" : undefined}>
                <GameCardView card={c} />
              </div>
            ))}
          </SlateFilter>
          <p className="mt-5 text-xs text-muted">{slate.oddsNote}</p>
        </>
      )}
    </>
  );
}

const isValueCard = (c: GameCard) => c.picks.some((p) => p.isValue);

/** Yesterday … a few days ahead, as one row of chips (scrolls sideways on a phone). */
async function DayStrip({ date }: { date: string }) {
  const { t, f } = await getI18n();
  const today = todayIso();
  // A phone shows the day before to two days after; wider screens three either side.
  const days = [-3, -2, -1, 0, 1, 2, 3].map((n) => ({ d: shift(date, n), wide: n < -1 || n > 2 }));
  const name = (d: string) =>
    d === today ? t.common.today : d === shift(today, -1) ? t.tonight.yesterday : d === shift(today, 1) ? t.tonight.tomorrow : f.day(d, { weekday: "short" });
  return (
    <nav aria-label={t.common.date} className="-mx-4 mb-5 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
      <ButtonLink href={`/?date=${shift(date, -7)}`} label={t.common.prevDay}>«</ButtonLink>
      {days.map(({ d, wide }) => {
        const on = d === date;
        return (
          <a
            key={d}
            href={d === today ? "/" : `/?date=${d}`}
            aria-current={on ? "date" : undefined}
            className={`${wide ? "hidden sm:flex" : "flex"} min-w-[4.25rem] shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 leading-tight transition-colors ${
              on ? "border-accent/60 bg-accent text-white shadow-[0_4px_14px_-6px_var(--accent)]" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
            }`}
          >
            <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${on ? "text-white/80" : "text-muted"}`}>{name(d)}</span>
            <span className="font-display text-base font-bold">{f.day(d, { month: "short", day: "numeric" })}</span>
          </a>
        );
      })}
      <ButtonLink href={`/?date=${shift(date, 7)}`} label={t.common.nextDay}>»</ButtonLink>
    </nav>
  );
}

/** The slate's bets at a glance: every Best pick with value, biggest edge first, each linking to its game card. */
function BestBets({ slate, i }: { slate: Slate; i: I18n }) {
  const { t, f } = i;
  const bets = slate.cards
    .filter((c) => c.best?.isValue)
    .sort((a, b) => (b.best!.edge ?? 0) - (a.best!.edge ?? 0));
  if (!bets.length && slate.cards.every((c) => c.locked)) return null; // nothing left to bet on this date
  return (
    <section className="mb-5">
      <SectionTitle>{t.tonight.bestBets}</SectionTitle>
      {bets.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface/60 px-4 py-2.5 text-xs text-ink-2 sm:text-sm">{t.tonight.noBestBets}</p>
      ) : (
        <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0">
          {bets.map((c) => {
            const p = c.best!;
            return (
              <a
                key={c.game.id}
                href={`#g${c.game.id}`}
                className="card card-hover relative w-64 shrink-0 snap-start overflow-hidden px-4 py-3 lg:w-auto"
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-edge/10 blur-2xl" />
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <TeamLogo abbrev={c.away.abbrev} size={20} />
                  <span className="font-semibold text-ink-2">{c.away.abbrev}</span>
                  <span>@</span>
                  <TeamLogo abbrev={c.home.abbrev} size={20} />
                  <span className="font-semibold text-ink-2">{c.home.abbrev}</span>
                  <span className="ml-auto truncate">{t.markets[p.market]}</span>
                </div>
                <div className="mt-2 font-display text-lg font-bold uppercase leading-tight tracking-wide">{p.label}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="tabular text-sm">
                    {p.odds && <span className="font-semibold">{f.american(p.odds)}</span>}
                    {p.edge !== null && <span className="ml-2 font-semibold text-edge">{f.signedPct(p.edge)}</span>}
                  </span>
                  <Stars n={CONFIDENCE_STARS[p.confidence]} label={t.confidenceShort[p.confidence]} aria={t.confidenceAria(t.confidence[p.confidence])} />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Graded Best picks over the 30 days before this date: wins, losses and flat 1-unit profit. */
function bestPickRecord(date: string) {
  const rows = sqlite
    .prepare("SELECT result, odds_decimal AS odds FROM picks WHERE is_best = 1 AND result IN ('win', 'loss') AND odds_decimal IS NOT NULL AND game_date >= ? AND game_date < ?")
    .all(shift(date, -30), date) as { result: string; odds: number }[];
  const w = rows.filter((r) => r.result === "win").length;
  return { n: rows.length, w, l: rows.length - w, units: rows.reduce((s, r) => s + (r.result === "win" ? r.odds - 1 : -1), 0) };
}
