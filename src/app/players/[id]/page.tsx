import { sqlite } from "@/db";
import { api } from "@/lib/nhl/client";
import { GameLogChart, type LogPoint } from "@/components/GameLogChart";
import { Card, Empty, PageTitle, StaleBanner, StatTile, TEAM_COLORS, Tabs } from "@/components/ui";
import type { PlayerGameLogEntry } from "@/lib/nhl/types";
import { svPct, toiFmt } from "@/lib/format";

export const dynamic = "force-dynamic";

const toiSec = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + (s || 0);
};

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const landing = await api.player(id);
  const p = landing.data;
  if (!p) return <><StaleBanner items={[landing]} /><Empty>This player couldn&apos;t be loaded.</Empty></>;
  const isGoalie = p.position === "G";
  const nhlSeasons = (p.seasonTotals ?? []).filter((s) => s.leagueAbbrev === "NHL" && s.gameTypeId === 2).map((s) => s.season);
  const seasons = [...new Set(nhlSeasons)].sort().reverse().slice(0, 5);
  const season = Number(sp.season) || p.featuredStats?.season || seasons[0];
  const totals = (p.seasonTotals ?? []).filter((s) => s.season === season && s.gameTypeId === 2 && s.leagueAbbrev === "NHL");
  const line = totals.reduce(
    (a, s) => ({ gp: a.gp + (s.gamesPlayed ?? 0), g: a.g + (s.goals ?? 0), a: a.a + (s.assists ?? 0), p: a.p + (s.points ?? 0), ppp: a.ppp + (s.powerPlayPoints ?? 0), sog: a.sog + (s.shots ?? 0) }),
    { gp: 0, g: 0, a: 0, p: 0, ppp: 0, sog: 0 },
  );

  return (
    <>
      <div
        className="card mb-5 flex items-center gap-4 px-5 pt-5 [&>div]:mb-0 [&>div]:pb-5"
        style={{ background: `linear-gradient(110deg, color-mix(in srgb, ${TEAM_COLORS[p.currentTeamAbbrev ?? ""] ?? "#3d6bff"} 28%, var(--surface)) 0%, var(--surface) 65%)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.headshot} alt="" width={88} height={88} className="self-end rounded-t-full bg-surface-2/60" />
        <PageTitle sub={`${p.position} · #${p.sweaterNumber ?? "–"} · ${p.fullTeamName?.default ?? "Free agent"} · born ${p.birthDate}`}>
          {p.firstName.default} {p.lastName.default}
        </PageTitle>
      </div>
      <StaleBanner items={[landing]} />
      {seasons.length > 1 && (
        <Tabs active={String(season)} tabs={seasons.map((s) => ({ key: String(s), label: `${String(s).slice(0, 4)}–${String(s).slice(6)}`, href: `/players/${id}?season=${s}` }))} />
      )}
      {isGoalie ? <GoalieLog id={id} season={season} /> : <SkaterLog id={id} season={season} line={line} />}
    </>
  );
}

async function SkaterLog({ id, season, line }: { id: number; season: number; line: { gp: number; g: number; a: number; p: number; ppp: number; sog: number } }) {
  const log = await api.gameLog(id, season, 2);
  const games: PlayerGameLogEntry[] = [...(log.data?.gameLog ?? [])].reverse(); // oldest first
  const points: LogPoint[] = games.map((g) => ({ date: g.gameDate.slice(5), opp: g.opponentAbbrev, home: g.homeRoadFlag === "H", a: g.goals, b: g.assists, extra: `${g.shots} SOG · ${g.toi} TOI` }));
  const split = (rows: PlayerGameLogEntry[]) => ({
    gp: rows.length,
    g: rows.reduce((s, r) => s + r.goals, 0),
    a: rows.reduce((s, r) => s + r.assists, 0),
    p: rows.reduce((s, r) => s + r.points, 0),
    sog: rows.reduce((s, r) => s + r.shots, 0),
    toi: rows.length ? rows.reduce((s, r) => s + toiSec(r.toi), 0) / rows.length : 0,
  });
  const home = split(games.filter((g) => g.homeRoadFlag === "H"));
  const road = split(games.filter((g) => g.homeRoadFlag === "R"));
  const l10 = split(games.slice(-10));
  const opps = [...new Set(games.map((g) => g.opponentAbbrev))].sort();
  const vs = opps.map((o) => ({ o, ...split(games.filter((g) => g.opponentAbbrev === o)) })).sort((a, b) => b.gp - a.gp || b.p - a.p);
  const Row = ({ label, s }: { label: string; s: ReturnType<typeof split> }) => (
    <tr className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
      <td className="!text-left">{label}</td><td>{s.gp}</td><td>{s.g}</td><td>{s.a}</td><td className="font-semibold">{s.p}</td>
      <td>{s.gp ? (s.p / s.gp).toFixed(2) : "–"}</td><td>{s.sog}</td><td>{s.gp ? toiFmt(s.toi) : "–"}</td>
    </tr>
  );
  return (
    <div className="space-y-4">
      <StaleBanner items={[log]} />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[["GP", line.gp], ["G", line.g], ["A", line.a], ["P", line.p], ["PPP", line.ppp], ["SOG", line.sog]].map(([k, v]) => (
          <StatTile key={k} label={k} value={v} />
        ))}
      </div>
      <Card>
        <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Game log</h2>
        {points.length ? <GameLogChart points={points} labelA="Goals" labelB="Assists" /> : <p className="text-sm text-muted">No games this season yet.</p>}
      </Card>
      <Card className="overflow-x-auto !p-0">
        <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">Splits</h2>
        <table className="tabular mt-2 w-full min-w-[480px] text-sm">
          <thead className="text-xs text-muted"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>Split</th><th>GP</th><th>G</th><th>A</th><th>P</th><th>P/GP</th><th>SOG</th><th>TOI</th></tr></thead>
          <tbody>
            <Row label="Home" s={home} />
            <Row label="Away" s={road} />
            <Row label="Last 10" s={l10} />
            {vs.map((v) => <Row key={v.o} label={`vs ${v.o}`} s={v} />)}
          </tbody>
        </table>
      </Card>
      <Card className="overflow-x-auto !p-0">
        <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">Games</h2>
        <table className="tabular mt-2 w-full min-w-[520px] text-sm">
          <thead className="text-xs text-muted"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left [&>th:nth-child(2)]:text-left"><th>Date</th><th>Opp</th><th>G</th><th>A</th><th>P</th><th>PPP</th><th>SOG</th><th>TOI</th><th>+/-</th></tr></thead>
          <tbody>
            {[...games].reverse().map((g) => (
              <tr key={g.gameId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
                <td className="!text-left"><a className="hover:text-accent-2" href={`/game/${g.gameId}`}>{g.gameDate}</a></td>
                <td className="!text-left">{g.homeRoadFlag === "H" ? "vs" : "@"} {g.opponentAbbrev}</td>
                <td>{g.goals}</td><td>{g.assists}</td><td className="font-semibold">{g.points}</td><td>{g.powerPlayPoints}</td><td>{g.shots}</td><td>{g.toi}</td><td>{g.plusMinus > 0 ? "+" : ""}{g.plusMinus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function GoalieLog({ id, season }: { id: number; season: number }) {
  // Goalie lines come from stored box scores (fields verified against the boxscore fixture).
  const rows = sqlite
    .prepare("SELECT game_id AS gameId, date, opponent, is_home AS home, shots_against AS sa, saves, goals_against AS ga, starter, toi_sec AS toi FROM player_games WHERE player_id = ? AND season = ? ORDER BY date")
    .all(id, season) as { gameId: number; date: string; opponent: string; home: number; sa: number; saves: number; ga: number; starter: number; toi: number }[];
  if (!rows.length) return <Empty>No stored games for this goalie in {String(season).slice(0, 4)}–{String(season).slice(6)}. Run <code className="text-ink">npm run sync</code>.</Empty>;
  const sa = rows.reduce((s, r) => s + r.sa, 0), ga = rows.reduce((s, r) => s + r.ga, 0);
  const split = (rs: typeof rows) => {
    const a = rs.reduce((s, r) => s + r.sa, 0), g = rs.reduce((s, r) => s + r.ga, 0);
    return { gp: rs.length, sv: a ? 1 - g / a : 0, gaa: rs.length ? (g * 3600) / Math.max(1, rs.reduce((s, r) => s + r.toi, 0)) : 0 };
  };
  const sets = [["Home", rows.filter((r) => r.home)], ["Away", rows.filter((r) => !r.home)], ["Last 10", rows.slice(-10)]] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[["GP", rows.length], ["SV%", svPct(sa ? 1 - ga / sa : 0)], ["GAA", split(rows).gaa.toFixed(2)]].map(([k, v]) => (
          <StatTile key={k} label={k} value={v} />
        ))}
      </div>
      <Card>
        <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Saves and goals against by game</h2>
        <GameLogChart points={rows.map((r) => ({ date: r.date.slice(5), opp: r.opponent, home: !!r.home, a: r.ga, b: 0, extra: `${r.saves}/${r.sa} saves (${r.sa ? svPct(r.saves / r.sa) : "–"})` }))} labelA="Goals against" />
      </Card>
      <Card className="!p-0">
        <table className="tabular w-full text-sm">
          <thead className="text-xs text-muted"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>Split</th><th>GP</th><th>SV%</th><th>GAA</th></tr></thead>
          <tbody>
            {sets.map(([label, rs]) => { const s = split([...rs]); return (
              <tr key={label} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right"><td className="!text-left">{label}</td><td>{s.gp}</td><td>{svPct(s.sv)}</td><td>{s.gaa.toFixed(2)}</td></tr>
            ); })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
