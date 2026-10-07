import { Suspense } from "react";
import { todayIso } from "@/lib/nhl/client";
import { buildSlate, type GameCard } from "@/lib/picks";
import { blend } from "@/lib/model/blend";
import { shift } from "@/components/DayStrip";
import { OddsFormat } from "@/components/OddsFormat";
import { PageTitle, SkeletonCards } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { ParlayChecker, type ParlayGame, type ParlayLeg } from "./ParlayChecker";

export const dynamic = "force-dynamic";

export default async function ParlayPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageTitle sub={t.parlay.sub} actions={<OddsFormat label={t.oddsBoard.format} american={t.oddsBoard.american} decimal={t.oddsBoard.decimal} />}>
        {t.parlay.title}
      </PageTitle>
      <Suspense fallback={<SkeletonCards n={2} h={260} />}>
        <Legs />
      </Suspense>
    </>
  );
}

/** Both sides of each priced moneyline and puck line, with Puck Edge's (market-blended) chance. */
function legsOf(card: GameCard, w: number, label: { moneyline: (t: string) => string; puckline: (t: string, line: number) => string }): ParlayLeg[] {
  const legs: ParlayLeg[] = [];
  const { home, away } = card;
  const ml = card.market.moneyline;
  if (ml) {
    const pHome = blend(home.winProb, ml.home.fair, w);
    legs.push(
      { key: `${card.game.id}:ml:${away.abbrev}`, label: label.moneyline(away.abbrev), p: 1 - pHome, fair: ml.away.fair, odds: ml.away.best, book: ml.away.bestBook },
      { key: `${card.game.id}:ml:${home.abbrev}`, label: label.moneyline(home.abbrev), p: pHome, fair: ml.home.fair, odds: ml.home.best, book: ml.home.bestBook },
    );
  }
  const pl = card.market.puckline;
  if (pl) {
    const model = pl.homeLine < 0 ? card.prediction.puckLine.homeMinus15 : card.prediction.puckLine.homePlus15;
    const pHome = blend(model, pl.home.fair, w);
    legs.push(
      { key: `${card.game.id}:pl:${away.abbrev}`, label: label.puckline(away.abbrev, -pl.homeLine), p: 1 - pHome, fair: pl.away.fair, odds: pl.away.best, book: pl.away.bestBook },
      { key: `${card.game.id}:pl:${home.abbrev}`, label: label.puckline(home.abbrev, pl.homeLine), p: pHome, fair: pl.home.fair, odds: pl.home.best, book: pl.home.bestBook },
    );
  }
  return legs;
}

async function Legs() {
  const { t, f, locale } = await getI18n();
  // Today's games, or the next day with priced games still to play.
  let date = todayIso();
  let games: ParlayGame[] = [];
  for (let n = 0; n < 3 && !games.length; n++) {
    date = shift(todayIso(), n);
    const slate = await buildSlate(date, locale);
    games = slate.cards
      .filter((c) => !c.locked)
      .map((c) => ({ id: c.game.id, away: c.away.abbrev, home: c.home.abbrev, start: c.game.startTimeUTC, legs: legsOf(c, slate.blend.w, t.label) }))
      .filter((g) => g.legs.length > 0);
  }
  return <ParlayChecker games={games} dateLabel={f.day(date, { weekday: "long", month: "long", day: "numeric" })} />;
}
