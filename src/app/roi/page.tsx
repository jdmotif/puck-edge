import { sqlite } from "@/db";
import { listBets } from "@/lib/data/bankroll";
import { settleBets } from "@/lib/grading";
import { getSettings } from "@/lib/settings";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import { todayIso } from "@/lib/nhl/client";
import { flatUnits } from "@/lib/roi";
import { shift } from "@/components/DayStrip";
import { PageTitle } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { STATIC_SITE } from "@/lib/static/mode";
import { RoiView, type ModelRecord } from "./RoiView";
import { StaticRoi } from "./StaticRoi";

export const dynamic = "force-dynamic";

/** Graded Best picks with a price, flat 1 unit each, over a few periods and by market. */
function modelRecord(): ModelRecord {
  const rows = sqlite
    .prepare("SELECT result, odds_decimal AS odds, market, game_date AS date FROM picks WHERE is_best = 1 AND result IN ('win', 'loss', 'push') AND odds_decimal IS NOT NULL")
    .all() as { result: string; odds: number; market: string; date: string }[];
  const today = todayIso();
  const since = (n: number) => rows.filter((r) => r.date >= shift(today, -n));
  const markets = [...new Set(rows.map((r) => r.market))];
  return {
    periods: [
      { key: "d7", ...flatUnits(since(7)) },
      { key: "d30", ...flatUnits(since(30)) },
      { key: "all", ...flatUnits(rows) },
    ],
    markets: markets.map((m) => ({ key: m, ...flatUnits(rows.filter((r) => r.market === m)) })),
  };
}

export default async function RoiPage() {
  const { t } = await getI18n();
  const model = modelRecord();
  if (STATIC_SITE) {
    return (
      <>
        <PageTitle sub={t.roi.sub}>{t.roi.title}</PageTitle>
        <StaticRoi model={model} />
      </>
    );
  }
  refreshRecentInBackground();
  settleBets();
  return (
    <>
      <PageTitle sub={t.roi.sub}>{t.roi.title}</PageTitle>
      <RoiView bets={listBets()} settings={getSettings()} model={model} />
    </>
  );
}
