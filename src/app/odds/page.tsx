import { Suspense } from "react";
import { api, todayIso } from "@/lib/nhl/client";
import { buildSlate, type GameCard } from "@/lib/picks";
import { fetchOddsApi, findEvent } from "@/lib/odds";
import { bestPrices, margin, mergeRows, oddsApiRows, partnerRow, scheduleRows, type BookRow } from "@/lib/odds-board";
import { blend } from "@/lib/model/blend";
import { DayStrip } from "@/components/DayStrip";
import { GroupFilter } from "@/components/GroupFilter";
import { LocalTime } from "@/components/LocalTime";
import { Odds } from "@/components/Odds";
import { OddsFormat } from "@/components/OddsFormat";
import { StaleBanner } from "@/components/StaleBanner";
import { Card, Empty, PageTitle, Rich, SkeletonCards, TeamLogo } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import type { I18n } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Every country's NHL betting partner: each feed carries one book's moneyline, puck line and total.
const PARTNER_COUNTRIES = ["US", "CA", "SE", "DE"];
const GROUPS = ["all", "US", "FR", "CA", "INT"];
const groupOf = (country: string) => (country === "US" || country === "FR" || country === "CA" ? country : "INT");

export default async function OddsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date = todayIso() } = await searchParams;
  const { t, f } = await getI18n();
  return (
    <>
      <PageTitle
        eyebrow={f.day(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        sub={t.oddsBoard.sub}
        actions={<OddsFormat label={t.oddsBoard.format} american={t.oddsBoard.american} decimal={t.oddsBoard.decimal} />}
      >
        {t.oddsBoard.title}
      </PageTitle>
      <DayStrip date={date} base="/odds" />
      <Suspense key={date} fallback={<SkeletonCards n={4} h={260} />}>
        <Board date={date} />
      </Suspense>
    </>
  );
}

async function Board({ date }: { date: string }) {
  const i = await getI18n();
  const { t } = i;
  const regions = (process.env.ODDS_API_REGION || "us").split(",").map((r) => r.trim()).filter(Boolean);
  const [slate, score, schedule, oddsApi, ...partners] = await Promise.all([
    buildSlate(date, i.locale),
    api.score(date),
    api.schedule(date),
    fetchOddsApi(),
    ...PARTNER_COUNTRIES.map((c) => api.partnerOdds(c)),
  ]);
  const oddsPartners = score.data?.oddsPartners ?? schedule.data?.oddsPartners ?? [];
  const games = slate.cards.map((card) => {
    if (card.locked) return { card, rows: [] as BookRow[] };
    const fromPartners = partners.flatMap((p) => {
      const pg = p.data?.games.find((g) => g.gameId === card.game.id);
      const row = pg && p.data ? partnerRow(pg, p.data.bettingPartner) : null;
      return row ? [row] : [];
    });
    const ev = findEvent(oddsApi.events, card.game);
    return { card, rows: mergeRows(fromPartners, ev ? oddsApiRows(ev, regions) : [], scheduleRows(card.game, oddsPartners)) };
  });
  if (!games.length) return <Empty>{t.oddsBoard.noGames}</Empty>;
  const counts: Record<string, number> = { all: 0 };
  for (const g of games) for (const r of g.rows) {
    counts.all++;
    counts[groupOf(r.country)] = (counts[groupOf(r.country)] ?? 0) + 1;
  }
  const upcoming = games.some((g) => !g.card.locked);
  return (
    <>
      <StaleBanner items={[...slate.sources, ...partners]} />
      {upcoming && !counts.FR && (
        <p className="mb-4 rounded-xl border border-line bg-surface/60 px-4 py-2.5 text-xs text-ink-2 sm:text-sm"><Rich text={t.oddsBoard.noFrance} /></p>
      )}
      <GroupFilter groups={GROUPS} labels={t.oddsBoard.countries} counts={counts} aria={t.oddsBoard.filterAria} className="space-y-4">
        {games.map(({ card, rows }) => <GameBoard key={card.game.id} card={card} rows={rows} w={slate.blend.w} i={i} />)}
      </GroupFilter>
      <p className="mt-5 text-xs text-muted">{t.oddsBoard.sources}</p>
    </>
  );
}

function GameBoard({ card, rows, w, i }: { card: GameCard; rows: BookRow[]; w: number; i: I18n }) {
  const { t, f } = i;
  const O = t.oddsBoard;
  const best = bestPrices(rows);
  const ml = card.market.moneyline;
  const pl = card.market.puckline && card.market.puckline.homeLine === best.plLine ? card.market.puckline : undefined;
  // Puck Edge's price: the margin-free market moved `w` toward the model, as fair odds.
  const pred = card.prediction.puckLine;
  const plHomeModel = pl ? (pl.homeLine < 0 ? pred.homeMinus15 : pred.homePlus15) : null;
  const ours = {
    mlHome: ml ? blend(card.home.winProb, ml.home.fair, w) : null,
    plHome: pl && plHomeModel !== null ? blend(plHomeModel, pl.home.fair, w) : null,
  };
  const inv = (p: number | null | undefined) => (p ? 1 / p : null);
  const th = "px-2 py-2 text-right font-semibold";
  const td = "px-2 py-2 text-right";
  return (
    <Card className="!p-0">
      <div className="flex items-center gap-2 px-4 pt-4 text-sm">
        <TeamLogo abbrev={card.away.abbrev} size={28} />
        <span className="font-display text-lg font-bold uppercase">{card.away.abbrev}</span>
        <span className="text-muted">@</span>
        <TeamLogo abbrev={card.home.abbrev} size={28} />
        <span className="font-display text-lg font-bold uppercase">{card.home.abbrev}</span>
        <span className="ml-auto text-xs text-muted"><LocalTime iso={card.game.startTimeUTC} /></span>
        <a href={`/game/${card.game.id}`} className="text-xs font-medium text-accent-2 hover:underline">{t.card.fullPreview}</a>
      </div>
      {card.locked ? (
        <p className="px-4 py-4 text-sm text-muted">{O.started}</p>
      ) : !rows.length ? (
        <p className="px-4 py-4 text-sm text-muted">{O.noOdds}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular mt-2 w-full min-w-[680px] text-sm">
            <thead className="text-[11px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th rowSpan={2} className="px-2 py-1 text-left font-semibold">{O.book}</th>
                <th colSpan={2} className="border-l border-line px-2 pt-1 text-center font-semibold">{O.ml}</th>
                <th colSpan={2} className="border-l border-line px-2 pt-1 text-center font-semibold">{O.pl}</th>
                <th colSpan={2} className="border-l border-line px-2 pt-1 text-center font-semibold">{O.total}</th>
                <th rowSpan={2} className="border-l border-line px-2 py-1 text-right font-semibold" title={O.marginHint}>{O.margin}</th>
              </tr>
              <tr className="normal-case tracking-normal">
                <th className={`${th} border-l border-line`}>{card.away.abbrev}</th>
                <th className={th}>{card.home.abbrev}</th>
                <th className={`${th} border-l border-line`}>{best.plLine !== null ? `${card.away.abbrev} ${f.line(-best.plLine, true)}` : card.away.abbrev}</th>
                <th className={th}>{best.plLine !== null ? `${card.home.abbrev} ${f.line(best.plLine, true)}` : card.home.abbrev}</th>
                <th className={`${th} border-l border-line`}>{best.totalLine !== null ? O.over(best.totalLine) : "O"}</th>
                <th className={th}>{best.totalLine !== null ? O.under(best.totalLine) : "U"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const plOn = r.pl && r.pl.homeLine === best.plLine ? r.pl : undefined;
                const totOn = r.total && r.total.line === best.totalLine ? r.total : undefined;
                return (
                  <tr key={r.country + r.book} data-g={groupOf(r.country)} className="border-t border-line">
                    <td className="whitespace-nowrap px-2 py-2 text-left">
                      <span className="font-medium">{r.book}</span>
                      {r.country && <span className="ml-1.5 rounded bg-surface-3 px-1 py-0.5 text-[10px] font-semibold text-muted">{r.country}</span>}
                      {!r.ml && r.ml3 && (
                        <span className="mt-0.5 block text-[11px] text-muted" title={O.threeWayHint}>
                          {O.threeWay} · {O.draw} <Odds d={r.ml3.draw} />
                        </span>
                      )}
                    </td>
                    {!r.ml && r.ml3 ? (
                      // 60-minute result: shown greyed, never the best moneyline.
                      <>
                        <td className={`${td} border-l border-line text-muted`} title={O.threeWayHint}><Odds d={r.ml3.away} /></td>
                        <td className={`${td} text-muted`} title={O.threeWayHint}><Odds d={r.ml3.home} /></td>
                      </>
                    ) : (
                      <>
                        <td className={`${td} border-l border-line`}><Odds d={r.ml?.away} best={!!r.ml && r.ml.away === best.mlAway} /></td>
                        <td className={td}><Odds d={r.ml?.home} best={!!r.ml && r.ml.home === best.mlHome} /></td>
                      </>
                    )}
                    <td className={`${td} border-l border-line`}><Odds d={plOn?.away} best={!!plOn && plOn.away === best.plAway} /></td>
                    <td className={td}><Odds d={plOn?.home} best={!!plOn && plOn.home === best.plHome} /></td>
                    <td className={`${td} border-l border-line`}><Odds d={totOn?.over} best={!!totOn && totOn.over === best.over} /></td>
                    <td className={td}><Odds d={totOn?.under} best={!!totOn && totOn.under === best.under} /></td>
                    <td className={`${td} border-l border-line text-ink-2`}>
                      {r.ml ? f.pct(margin(r.ml.away, r.ml.home), 1) : r.ml3 ? f.pct(1 / r.ml3.away + 1 / r.ml3.draw + 1 / r.ml3.home - 1, 1) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-ink-2">
              <tr className="border-t border-line-strong bg-surface-2/50">
                <td className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted">{O.fair}</td>
                <td className={`${td} border-l border-line`}><Odds d={inv(ml?.away.fair)} /></td>
                <td className={td}><Odds d={inv(ml?.home.fair)} /></td>
                <td className={`${td} border-l border-line`}><Odds d={inv(pl?.away.fair)} /></td>
                <td className={td}><Odds d={inv(pl?.home.fair)} /></td>
                <td className={`${td} border-l border-line text-muted`} colSpan={3} />
              </tr>
              <tr className="border-t border-line bg-accent/5" title={O.modelHint(f.pct(w))}>
                <td className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-accent-2">{O.model}</td>
                <td className={`${td} border-l border-line`}><Odds d={ours.mlHome !== null ? 1 / (1 - ours.mlHome) : null} /></td>
                <td className={td}><Odds d={inv(ours.mlHome)} /></td>
                <td className={`${td} border-l border-line`}><Odds d={ours.plHome !== null ? 1 / (1 - ours.plHome) : null} /></td>
                <td className={td}><Odds d={inv(ours.plHome)} /></td>
                <td className={`${td} border-l border-line text-muted`} colSpan={3} />
              </tr>
            </tfoot>
          </table>
          <p className="px-4 pb-3 pt-1 text-xs text-muted">{O.modelHint(f.pct(w))}</p>
        </div>
      )}
    </Card>
  );
}
