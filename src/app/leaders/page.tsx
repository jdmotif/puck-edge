import { sqlite } from "@/db";
import { api, seasonFor, todayIso } from "@/lib/nhl/client";
import { SortableTable } from "@/components/SortableTable";
import { Card, Empty, PageTitle, StaleBanner, Tabs } from "@/components/ui";
import type { LeaderEntry } from "@/lib/nhl/types";

export const dynamic = "force-dynamic";

export default async function LeadersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "skaters" } = await searchParams;
  const tabs = [
    { key: "skaters", label: "Skaters", href: "/leaders?tab=skaters" },
    { key: "goalies", label: "Goalies", href: "/leaders?tab=goalies" },
    { key: "hot", label: "Hot & cold", href: "/leaders?tab=hot" },
  ];
  return (
    <>
      <PageTitle>Leaders</PageTitle>
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
                <a href={`/players/${e.id}`} className="flex-1 truncate hover:text-accent">{e.firstName.default} {e.lastName.default}</a>
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
  const [{ teams, stats, sources }, leaders] = await Promise.all([allClubStats(), api.skaterLeaders()]);
  const rows = stats.flatMap((s, i) =>
    (s.data?.skaters ?? []).map((p) => ({
      name: `${p.firstName.default} ${p.lastName.default}`,
      href: `/players/${p.playerId}`,
      team: teams[i],
      pos: p.positionCode,
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
      <TopCards data={leaders.data} cats={[{ key: "points", label: "Points" }, { key: "goals", label: "Goals" }, { key: "assists", label: "Assists" }]} />
      {rows.length ? (
        <SortableTable
          initialSort="p"
          columns={[
            { key: "name", label: "Player", left: true },
            { key: "team", label: "Team", left: true },
            { key: "pos", label: "Pos", left: true },
            { key: "gp", label: "GP" },
            { key: "g", label: "G" },
            { key: "a", label: "A" },
            { key: "p", label: "P" },
            { key: "ptsPerGp", label: "P/GP", decimals: 2 },
            { key: "ppg", label: "PPG" },
            { key: "sog", label: "SOG" },
            { key: "toi", label: "TOI/GP", format: "toi" },
            { key: "pm", label: "+/-" },
          ]}
          rows={rows}
        />
      ) : <Empty>Skater stats aren&apos;t available right now.</Empty>}
    </>
  );
}

async function Goalies() {
  const [{ teams, stats, sources }, leaders] = await Promise.all([allClubStats(), api.goalieLeaders()]);
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
          { key: "wins", label: "Wins" },
          { key: "savePctg", label: "Save %", fmt: (v) => v.toFixed(3).replace(/^0/, "") },
          { key: "goalsAgainstAverage", label: "GAA", fmt: (v) => v.toFixed(2) },
        ]}
      />
      {rows.length ? (
        <SortableTable
          initialSort="w"
          ascendingKeys={["gaa", "l", "otl"]}
          columns={[
            { key: "name", label: "Goalie", left: true },
            { key: "team", label: "Team", left: true },
            { key: "gp", label: "GP" },
            { key: "gs", label: "GS" },
            { key: "w", label: "W" },
            { key: "l", label: "L" },
            { key: "otl", label: "OTL" },
            { key: "sv", label: "SV%", format: "sv" },
            { key: "gaa", label: "GAA", decimals: 2 },
            { key: "sa", label: "SA" },
            { key: "so", label: "SO" },
          ]}
          rows={rows}
        />
      ) : <Empty>Goalie stats aren&apos;t available right now.</Empty>}
    </>
  );
}

interface HotRow { player_id: number; name: string; team: string; gp: number; pts: number; l5gp: number; l5pts: number; l5g: number }

function HotCold() {
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
  if (!rows.length) return <Empty>Hot &amp; cold needs stored box scores. Run <code className="text-ink">npm run sync</code>; players need 8+ games.</Empty>;
  const List = ({ title, list, tone }: { title: string; list: typeof hot; tone: string }) => (
    <Card className="!p-0">
      <h2 className={`px-3 pt-3 text-sm font-semibold ${tone}`}>{title}</h2>
      <table className="tabular mt-2 w-full text-sm">
        <thead className="text-xs text-muted"><tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-right [&>th:first-child]:text-left"><th>Player</th><th>Last 5</th><th>Season P/GP</th><th>Last 5 P/GP</th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.player_id} className="border-t border-line [&>td]:px-2 [&>td]:py-1 [&>td]:text-right">
              <td className="!text-left"><a href={`/players/${r.player_id}`} className="hover:text-accent">{r.name}</a> <span className="text-xs text-muted">{r.team}</span></td>
              <td className="text-ink-2">{r.l5g}G {r.l5pts}P</td>
              <td>{r.seasonRate.toFixed(2)}</td>
              <td className="font-semibold">{r.l5.toFixed(2)}</td>
            </tr>
          ))}
          {!list.length && <tr><td className="p-3 text-muted">Nobody far off their season pace.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <List title="🔥 Hot: last 5 well above season pace" list={hot} tone="text-good" />
      <List title="🧊 Cold: last 5 well below season pace" list={cold} tone="text-s1" />
      <p className="text-xs text-muted md:col-span-2">
        A player is listed when their last-5 points rate is more than one standard deviation (Poisson noise for 5 games) away from their season rate.
        {earlySeason && " Until a player has 20 games this season, \"season\" means this season and last season together, and the last 5 can include last season's final games."}
      </p>
    </div>
  );
}
