import { sqlite } from "@/db";
import { api, seasonFor, todayIso } from "@/lib/nhl/client";
import { SortableTable } from "@/components/SortableTable";
import { Card, Empty, PageTitle, Tabs } from "@/components/ui";
import { StaleBanner } from "@/components/StaleBanner";
import type { LeaderEntry } from "@/lib/nhl/types";
import { getI18n } from "@/lib/i18n/server";
import { Rich } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LeadersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "skaters" } = await searchParams;
  const { t } = await getI18n();
  const tabs = [
    { key: "skaters", label: t.leaders.skaters, href: "/leaders?tab=skaters" },
    { key: "goalies", label: t.leaders.goalies, href: "/leaders?tab=goalies" },
    { key: "hot", label: t.leaders.hot, href: "/leaders?tab=hot" },
  ];
  return (
    <>
      <PageTitle>{t.leaders.title}</PageTitle>
      <Tabs tabs={tabs} active={tab} />
      {tab === "goalies" ? <Goalies /> : tab === "hot" ? <HotCold /> : <Skaters />}
    </>
  );
}

async function allClubStats() {
  const standings = await api.standings("now");
  const teams = [...new Set((standings.data?.standings ?? []).map((s) => s.teamAbbrev.default))];
  const stats = await Promise.all(teams.map((t) => api.clubStats(t)));
  return { teams, stats, sources: [standings, ...stats] };
}

function TopCards({ data, cats }: { data: Record<string, LeaderEntry[]> | null; cats: { key: string; label: string; fmt?: (v: number) => string }[] }) {
  if (!data) return null;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      {cats.map((c) => (
        <Card key={c.key} className="!p-3">
          <div className="mb-1 text-xs uppercase text-muted">{c.label}</div>
          <ol className="space-y-0.5 text-sm">
            {(data[c.key] ?? []).slice(0, 5).map((e) => (
              <li key={e.id} className="flex gap-2">
                <a href={`/players/${e.id}`} className="flex-1 truncate hover:text-accent-2">{e.firstName.default} {e.lastName.default}</a>
                <span className="text-muted">{e.teamAbbrev}</span>
                <span className="w-12 text-right tabular font-semibold">{c.fmt ? c.fmt(e.value) : e.value}</span>
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}

async function Skaters() {
  const [{ teams, stats, sources }, leaders, { t }] = await Promise.all([allClubStats(), api.skaterLeaders(), getI18n()]);
  const L = t.leaders, st = t.stats;
  const rows = stats.flatMap((s, i) =>
    (s.data?.skaters ?? []).map((p) => ({
      name: `${p.firstName.default} ${p.lastName.default}`,
      href: `/players/${p.playerId}`,
      team: teams[i],
      pos: st.position(p.positionCode),
      gp: p.gamesPlayed,
      g: p.goals,
      a: p.assists,
      p: p.points,
      ppg: p.powerPlayGoals,
      sog: p.shots,
      toi: p.avgTimeOnIcePerGame,
      ptsPerGp: p.gamesPlayed ? p.points / p.gamesPlayed : 0,
      pm: p.plusMinus,
    })),
  );
  return (
    <>
      <StaleBanner items={[...sources, leaders]} />
      <TopCards data={leaders.data} cats={[{ key: "points", label: L.points }, { key: "goals", label: L.goals }, { key: "assists", label: L.assists }]} />
      {rows.length ? (
        <SortableTable
          initialSort="p"
          columns={[
            { key: "name", label: t.common.player, left: true },
            { key: "team", label: t.common.team, left: true },
            { key: "pos", label: st.pos, left: true },
            { key: "gp", label: st.gp },
            { key: "g", label: st.g },
            { key: "a", label: st.a },
            { key: "p", label: st.p },
            { key: "ptsPerGp", label: st.ptsPerGp, decimals: 2 },
            { key: "ppg", label: st.ppg },
            { key: "sog", label: st.sog },
            { key: "toi", label: st.toiPerGp, format: "toi" },
            { key: "pm", label: st.pm },
          ]}
          rows={rows}
        />
      ) : <Empty>{L.noSkaters}</Empty>}
    </>
  );
}

async function Goalies() {
  const [{ teams, stats, sources }, leaders, { t, f }] = await Promise.all([allClubStats(), api.goalieLeaders(), getI18n()]);
  const L = t.leaders, st = t.stats;
  const rows = stats.flatMap((s, i) =>
    (s.data?.goalies ?? []).map((g) => ({
      name: `${g.firstName.default} ${g.lastName.default}`,
      href: `/players/${g.playerId}`,
      team: teams[i],
      gp: g.gamesPlayed,
      gs: g.gamesStarted,
      w: g.wins,
      l: g.losses,
      otl: g.overtimeLosses,
      sv: g.savePercentage,
      gaa: g.goalsAgainstAverage,
      sa: g.shotsAgainst,
      so: g.shutouts,
    })),
  );
  return (
    <>
      <StaleBanner items={[...sources, leaders]} />
      <TopCards
        data={leaders.data}
        cats={[
          { key: "wins", label: L.wins },
          { key: "savePctg", label: L.savePct, fmt: (v) => f.svPct(v) },
          { key: "goalsAgainstAverage", label: L.gaa, fmt: (v) => f.num(v, 2) },
        ]}
      />
      {rows.length ? (
        <SortableTable
          initialSort="w"
          ascendingKeys={["gaa", "l", "otl"]}
          columns={[
            { key: "name", label: t.common.goalie, left: true },
            { key: "team", label: t.common.team, left: true },
            { key: "gp", label: st.gp },
            { key: "gs", label: st.gs },
            { key: "w", label: st.w },
            { key: "l", label: st.l },
            { key: "otl", label: st.otl },
            { key: "sv", label: st.sv, format: "sv" },
            { key: "gaa", label: st.gaa, decimals: 2 },
            { key: "sa", label: st.sa },
            { key: "so", label: st.so },
          ]}
          rows={rows}
        />
      ) : <Empty>{L.noGoalies}</Empty>}
    </>
  );
}

interface HotRow { player_id: number; name: string; team: string; gp: number; pts: number; l5gp: number; l5pts: number; l5g: number }

async function HotCold() {
  const { t, f } = await getI18n();
  const L = t.leaders;
  const season = seasonFor(todayIso());
  // Last-5 points rate vs the season rate, from stored box scores. Early in a season (under
  // 20 GP) the baseline also includes last season, so the list isn't empty for the first month.
  const rows = sqlite
    .prepare(
      `WITH ranked AS (
         SELECT player_id, name, team, points, goals, date, season,
                ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY date DESC) AS rn
         FROM player_games WHERE season IN (?, ?) AND position != 'G'),
       agg AS (
         SELECT player_id, MAX(CASE WHEN rn = 1 THEN name END) AS name, MAX(CASE WHEN rn = 1 THEN team END) AS team,
                SUM(season = ?) AS cur_gp, SUM(CASE WHEN season = ? THEN points ELSE 0 END) AS cur_pts,
                COUNT(*) AS all_gp, SUM(points) AS all_pts,
                SUM(CASE WHEN rn <= 5 THEN 1 ELSE 0 END) AS l5gp,
                SUM(CASE WHEN rn <= 5 THEN points ELSE 0 END) AS l5pts,
                SUM(CASE WHEN rn <= 5 THEN goals ELSE 0 END) AS l5g,
                MAX(CASE WHEN rn = 1 THEN season END) AS last_season
         FROM ranked GROUP BY player_id)
       SELECT player_id, name, team, l5gp, l5pts, l5g,
              CASE WHEN cur_gp >= 20 THEN cur_gp ELSE all_gp END AS gp,
              CASE WHEN cur_gp >= 20 THEN cur_pts ELSE all_pts END AS pts
       FROM agg WHERE last_season = ? AND l5gp = 5 AND gp >= 8`,
    )
    .all(season - 10001, season, season, season, season) as HotRow[];
  const earlySeason = (sqlite.prepare("SELECT COUNT(*) AS n FROM games WHERE season = ?").get(season) as { n: number }).n < 16 * 20;
  const scored = rows
    .filter((r) => r.pts / r.gp >= 0.3) // ignore depth players for "cold"
    .map((r) => {
      const seasonRate = r.pts / r.gp;
      const l5 = r.l5pts / 5;
      // Difference in points/game scaled by the Poisson noise of a 5-game sample.
      const z = (l5 - seasonRate) / Math.sqrt(Math.max(seasonRate, 0.2) / 5);
      return { ...r, seasonRate, l5, z };
    });
  const hot = [...scored].sort((a, b) => b.z - a.z).filter((r) => r.z > 1).slice(0, 12);
  const cold = [...scored].sort((a, b) => a.z - b.z).filter((r) => r.z < -1).slice(0, 12);
  if (!rows.length) return <Empty><Rich text={L.hotEmpty} /></Empty>;
  const List = ({ title, list, tone }: { title: string; list: typeof hot; tone: string }) => (
    <Card className="!p-0">
      <h2 className={`px-4 pt-4 font-display text-lg font-bold uppercase tracking-wide ${tone}`}>{title}</h2>
      <table className="tabular mt-2 w-full text-sm">
        <thead className="text-xs text-muted"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>{t.common.player}</th><th>{L.last5}</th><th>{L.seasonRate}</th><th>{L.last5Rate}</th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.player_id} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
              <td className="!text-left"><a href={`/players/${r.player_id}`} className="hover:text-accent-2">{r.name}</a> <span className="text-xs text-muted">{r.team}</span></td>
              <td className="text-ink-2">{t.stats.goalsPoints(r.l5g, r.l5pts)}</td>
              <td>{f.num(r.seasonRate, 2)}</td>
              <td className="font-semibold">{f.num(r.l5, 2)}</td>
            </tr>
          ))}
          {!list.length && <tr><td className="p-3 text-muted">{L.nobody}</td></tr>}
        </tbody>
      </table>
    </Card>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <List title={L.hotTitle} list={hot} tone="text-good" />
      <List title={L.coldTitle} list={cold} tone="text-s1" />
      <p className="text-xs text-muted md:col-span-2">
        {L.explain}
        {earlySeason && L.early}
      </p>
    </div>
  );
}
