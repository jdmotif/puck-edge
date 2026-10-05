import { Suspense } from "react";
import { buildSlate, logPicks } from "@/lib/picks";
import { todayIso } from "@/lib/nhl/client";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import { GameCardView } from "@/components/GameCardView";
import { ButtonLink, Empty, PageTitle, SkeletonCards, StaleBanner, StatTile } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { signedPct } from "@/lib/format";

export const dynamic = "force-dynamic";

const shift = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export default async function Tonight({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date = todayIso() } = await searchParams;
  const label = date === todayIso() ? "Tonight" : new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <>
      <PageTitle
        eyebrow={new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        actions={
          <>
            <ButtonLink href={`/?date=${shift(date, -1)}`} label="Previous day">←</ButtonLink>
            <ButtonLink href="/" active={date === todayIso()}>Today</ButtonLink>
            <ButtonLink href={`/?date=${shift(date, 1)}`} label="Next day">→</ButtonLink>
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
  const slate = await buildSlate(date);
  if (date >= todayIso()) logPicks(slate);
  const settings = getSettings();
  const valueCount = slate.cards.filter((c) => c.picks.some((p) => p.isValue)).length;
  const topPick = slate.cards.flatMap((c) => c.picks).filter((p) => p.edge !== null).sort((a, b) => b.edge! - a.edge!)[0];
  const topEdge = topPick?.edge ?? null;
  return (
    <>
      <StaleBanner items={slate.sources} />
      {!slate.hasHistory && (
        <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">
          No game history stored yet, so the model sees every team as average and won&apos;t label Value picks. Run <code>npm run sync</code> once to backfill this season and last (a few minutes).
        </div>
      )}
      {slate.cards.length === 0 ? (
        <Empty>No NHL games on this date.</Empty>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Games" value={slate.cards.length} hint={slate.cards.some((c) => c.live) ? "Some already under way" : "On the slate"} />
            <StatTile label="Value picks" value={valueCount} tone={valueCount ? "edge" : undefined} hint={`Edge ≥ ${(settings.edgeThreshold * 100).toFixed(1)}%`} />
            <StatTile label="Top edge" value={topEdge !== null ? signedPct(topEdge) : "–"} tone={topEdge !== null && topEdge > 0 ? "good" : undefined} hint={topPick ? topPick.label : "No priced picks"} />
            <StatTile label="Model" value={slate.modelFitted ? slate.modelGames.toLocaleString() : "Prior"} hint={slate.modelFitted ? "Games fitted" : "Until the backfill runs"} />
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
