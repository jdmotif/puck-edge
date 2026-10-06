import { api, todayIso } from "@/lib/nhl/client";
import { listBets } from "@/lib/data/bankroll";
import { settleBets } from "@/lib/grading";
import { getSettings } from "@/lib/settings";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import { PageTitle } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { STATIC_SITE } from "@/lib/static/mode";
import type { GameOption } from "./BetForm";
import { BetsView } from "./BetsView";
import { StaticBets } from "./StaticBets";

export const dynamic = "force-dynamic";

export default async function BetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { t } = await getI18n();
  const sched = await api.schedule(todayIso());
  const games: GameOption[] = (sched.data?.gameWeek ?? []).flatMap((d) =>
    d.games
      .filter((g) => g.gameState === "FUT" || g.gameState === "PRE" || g.gameState === "LIVE" || g.gameState === "CRIT")
      .map((g) => ({ id: g.id, date: d.date, label: `${g.awayTeam.abbrev} @ ${g.homeTeam.abbrev}`, home: g.homeTeam.abbrev, away: g.awayTeam.abbrev })),
  );
  if (STATIC_SITE) {
    return (
      <>
        <PageTitle sub={t.bets.sub}>{t.bets.title}</PageTitle>
        <StaticBets games={games} />
      </>
    );
  }
  refreshRecentInBackground();
  settleBets(); // also stores closing lines for bets whose game has started
  const sp = await searchParams;
  return (
    <>
      <PageTitle sub={t.bets.sub}>{t.bets.title}</PageTitle>
      <BetsView bets={listBets()} settings={getSettings()} games={games} prefill={{ ...sp }} flash={{ error: sp.error, added: !!sp.added }} />
    </>
  );
}
