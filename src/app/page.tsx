import { Suspense } from "react";
import { attachChanges, buildSlate, logPicks } from "@/lib/picks";
import { todayIso } from "@/lib/nhl/client";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import { GameCardView } from "@/components/GameCardView";
import { ButtonLink, Empty, PageTitle, Rich, SkeletonCards, StaleBanner, StatTile } from "@/components/ui";
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
      <PageTitle
        eyebrow={f.day(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        actions={
          <>
            <ButtonLink href={`/?date=${shift(date, -1)}`} label={t.common.prevDay}>←</ButtonLink>
            <ButtonLink href="/" active={date === todayIso()}>{t.common.today}</ButtonLink>
            <ButtonLink href={`/?date=${shift(date, 1)}`} label={t.common.nextDay}>→</ButtonLink>
          </>
        }
      >
        {label}
      </PageTitle>
      <Suspense key={date} fallback={<SkeletonCards n={4} h={300} />}>
        <SlateView date={date} />
      </Suspense>
    </>
  );
}

async function SlateView({ date }: { date: string }) {
  refreshRecentInBackground();
  const { t, f, locale } = await getI18n();
  const slate = await buildSlate(date, locale);
  if (date >= todayIso()) logPicks(slate);
  else attachChanges(slate);
  const settings = getSettings();
  const valueCount = slate.cards.filter((c) => c.picks.some((p) => p.isValue)).length;
  const topPick = slate.cards.flatMap((c) => c.picks).filter((p) => p.edge !== null).sort((a, b) => b.edge! - a.edge!)[0];
  const topEdge = topPick?.edge ?? null;
  return (
    <>
      <StaleBanner items={slate.sources} />
      {!slate.hasHistory && (
        <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">
          <Rich text={t.tonight.noHistory} />
        </div>
      )}
      {slate.cards.length === 0 ? (
        <Empty>{t.tonight.noGames}</Empty>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t.tonight.games} value={slate.cards.length} hint={slate.cards.some((c) => c.live) ? t.tonight.someLive : t.tonight.onSlate} />
            <StatTile label={t.tonight.valuePicks} value={valueCount} tone={valueCount ? "edge" : undefined} hint={t.tonight.edgeAtLeast(settings.edgeThreshold)} />
            <StatTile label={t.tonight.topEdge} value={topEdge !== null ? f.signedPct(topEdge) : "–"} tone={topEdge !== null && topEdge > 0 ? "good" : undefined} hint={topPick ? topPick.label : t.tonight.noPriced} />
            <StatTile label={t.tonight.model} value={slate.modelFitted ? f.int(slate.modelGames) : t.tonight.prior} hint={slate.modelFitted ? t.tonight.fitted : t.tonight.untilBackfill} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {slate.cards.map((c) => <GameCardView key={c.game.id} card={c} />)}
          </div>
          <p className="mt-5 text-xs text-muted">{slate.oddsNote}</p>
        </>
      )}
    </>
  );
}
