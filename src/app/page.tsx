import { Suspense } from "react";
import { buildSlate, logPicks } from "@/lib/picks";
import { todayIso } from "@/lib/nhl/client";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import { GameCardView } from "@/components/GameCardView";
import { Empty, PageTitle, SkeletonCards, StaleBanner } from "@/components/ui";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const shift = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export default async function Tonight({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date = todayIso() } = await searchParams;
  const label = date === todayIso() ? "Tonight" : new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <PageTitle sub={new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}>{label}</PageTitle>
        <div className="flex gap-1 text-sm">
          <a className="rounded-md border border-line px-2 py-1" href={`/?date=${shift(date, -1)}`}>←</a>
          <a className="rounded-md border border-line px-2 py-1" href="/">Today</a>
          <a className="rounded-md border border-line px-2 py-1" href={`/?date=${shift(date, 1)}`}>→</a>
        </div>
      </div>
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
  return (
    <>
      <StaleBanner items={slate.sources} />
      {slate.cards.length === 0 ? (
        <Empty>No NHL games on this date.</Empty>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-2">
            {slate.cards.length} game{slate.cards.length === 1 ? "" : "s"} · {valueCount} with a value pick (edge ≥ {(settings.edgeThreshold * 100).toFixed(1)}%) ·{" "}
            {slate.modelFitted ? `model fitted on ${slate.modelGames} games` : "model using prior weights until the backfill has run"}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {slate.cards.map((c) => <GameCardView key={c.game.id} card={c} />)}
          </div>
          <p className="mt-4 text-xs text-muted">{slate.oddsNote}</p>
        </>
      )}
    </>
  );
}
