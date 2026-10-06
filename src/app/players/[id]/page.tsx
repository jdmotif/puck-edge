import { sqlite } from "@/db";
import { api, seasonFor, todayIso } from "@/lib/nhl/client";
import { GameLogChart, type LogPoint } from "@/components/GameLogChart";
import { Card, Empty, PageTitle, Rich, StatTile, TEAM_COLORS, Tabs } from "@/components/ui";
import { StaleBanner } from "@/components/StaleBanner";
import type { PlayerGameLogEntry } from "@/lib/nhl/types";
import { getI18n } from "@/lib/i18n/server";
import type { I18n } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const toiSec = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + (s || 0);
};

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const i = await getI18n();
  const { t, f } = i;
  const landing = await api.player(id);
  const p = landing.data;
  if (!p) return <><StaleBanner items={[landing]} /><Empty>{t.player.notLoaded}</Empty></>;
  const isGoalie = p.position === "G";
  const nhlSeasons = (p.seasonTotals ?? []).filter((s) => s.leagueAbbrev === "NHL" && s.gameTypeId === 2).map((s) => s.season);
  const seasons = [...new Set(nhlSeasons)].sort().reverse().slice(0, 5);
  // A call-up with no NHL games yet has no seasons listed; show the current one.
  const season = Number(sp.season) || p.featuredStats?.season || seasons[0] || seasonFor(todayIso());
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
        <PageTitle sub={t.player.sub(t.stats.position(p.position), String(p.sweaterNumber ?? "–"), p.fullTeamName?.default ?? null, f.day(p.birthDate, { year: "numeric", month: "long", day: "numeric" }))}>
          {p.firstName.default} {p.lastName.default}
        </PageTitle>
      </div>
      <StaleBanner items={[landing]} />
      {seasons.length > 1 && (
        <Tabs active={String(season)} tabs={seasons.map((s) => ({ key: String(s), label: f.season(s), href: `/players/${id}?season=${s}` }))} />
      )}
      {isGoalie ? <GoalieLog i={i} id={id} season={season} /> : <SkaterLog i={i} id={id} season={season} line={line} />}
    </>
  );
}

async function SkaterLog({ i: { t, f }, id, season, line }: { i: I18n; id: number; season: number; line: { gp: number; g: number; a: number; p: number; ppp: number; sog: number } }) {
  const st = t.stats;
  const log = await api.gameLog(id, season, 2);
  const games: PlayerGameLogEntry[] = [...(log.data?.gameLog ?? [])].reverse(); // oldest first
  const points: LogPoint[] = games.map((g) => ({ date: g.gameDate.slice(5), opp: g.opponentAbbrev, home: g.homeRoadFlag === "H", a: g.goals, b: g.assists, extra: t.player.extra(g.shots, g.toi) }));
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
      <td>{s.gp ? f.num(s.p / s.gp, 2) : "–"}</td><td>{s.sog}</td><td>{s.gp ? f.toi(s.toi) : "–"}</td>
    </tr>
  );
  return (
    <div className="space-y-4">
      <StaleBanner items={[log]} />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[[st.gp, line.gp], [st.g, line.g], [st.a, line.a], [st.p, line.p], [st.ppp, line.ppp], [st.sog, line.sog]].map(([k, v]) => (
          <StatTile key={k} label={k} value={v} />
        ))}
      </div>
      <Card>
        <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{t.player.gameLog}</h2>
        {points.length ? <GameLogChart points={points} labelA={t.player.goals} labelB={t.player.assists} /> : <p className="text-sm text-muted">{t.player.noGames}</p>}
      </Card>
      <Card className="overflow-x-auto !p-0">
        <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">{t.player.splits}</h2>
        <table className="tabular mt-2 w-full min-w-[480px] text-sm">
          <thead className="text-xs text-muted"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>{t.common.split}</th><th>{st.gp}</th><th>{st.g}</th><th>{st.a}</th><th>{st.p}</th><th>{st.ptsPerGp}</th><th>{st.sog}</th><th>{st.toi}</th></tr></thead>
          <tbody>
            <Row label={t.common.home} s={home} />
            <Row label={t.common.away} s={road} />
            <Row label={t.common.last10} s={l10} />
            {vs.map((v) => <Row key={v.o} label={t.common.vs(v.o)} s={v} />)}
          </tbody>
        </table>
      </Card>
      <Card className="overflow-x-auto !p-0">
        <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">{t.player.games}</h2>
        <table className="tabular mt-2 w-full min-w-[520px] text-sm">
          <thead className="text-xs text-muted"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left [&>th:nth-child(2)]:text-left"><th>{t.common.date}</th><th>{st.opp}</th><th>{st.g}</th><th>{st.a}</th><th>{st.p}</th><th>{st.ppp}</th><th>{st.sog}</th><th>{st.toi}</th><th>{st.pm}</th></tr></thead>
          <tbody>
            {[...games].reverse().map((g) => (
              <tr key={g.gameId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
                <td className="!text-left"><a className="hover:text-accent-2" href={`/game/${g.gameId}`}>{g.gameDate}</a></td>
                <td className="!text-left">{g.homeRoadFlag === "H" ? t.common.vs(g.opponentAbbrev) : t.common.at(g.opponentAbbrev)}</td>
                <td>{g.goals}</td><td>{g.assists}</td><td className="font-semibold">{g.points}</td><td>{g.powerPlayPoints}</td><td>{g.shots}</td><td>{g.toi}</td><td>{g.plusMinus > 0 ? "+" : ""}{g.plusMinus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function GoalieLog({ i: { t, f }, id, season }: { i: I18n; id: number; season: number }) {
  const st = t.stats;
  // Goalie lines come from stored box scores (fields verified against the boxscore fixture).
  const rows = sqlite
    .prepare("SELECT game_id AS gameId, date, opponent, is_home AS home, shots_against AS sa, saves, goals_against AS ga, starter, toi_sec AS toi FROM player_games WHERE player_id = ? AND season = ? ORDER BY date")
    .all(id, season) as { gameId: number; date: string; opponent: string; home: number; sa: number; saves: number; ga: number; starter: number; toi: number }[];
  if (!rows.length) return <Empty><Rich text={t.player.goalieEmpty(f.season(season))} /></Empty>;
  const sa = rows.reduce((s, r) => s + r.sa, 0), ga = rows.reduce((s, r) => s + r.ga, 0);
  const split = (rs: typeof rows) => {
    const a = rs.reduce((s, r) => s + r.sa, 0), g = rs.reduce((s, r) => s + r.ga, 0);
    return { gp: rs.length, sv: a ? 1 - g / a : 0, gaa: rs.length ? (g * 3600) / Math.max(1, rs.reduce((s, r) => s + r.toi, 0)) : 0 };
  };
  const sets = [[t.common.home, rows.filter((r) => r.home)], [t.common.away, rows.filter((r) => !r.home)], [t.common.last10, rows.slice(-10)]] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[[st.gp, rows.length], [st.sv, f.svPct(sa ? 1 - ga / sa : 0)], [st.gaa, f.num(split(rows).gaa, 2)]].map(([k, v]) => (
          <StatTile key={k} label={k} value={v} />
        ))}
      </div>
      <Card>
        <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{t.player.goalieChart}</h2>
        <GameLogChart points={rows.map((r) => ({ date: r.date.slice(5), opp: r.opponent, home: !!r.home, a: r.ga, b: 0, extra: t.player.saves(r.saves, r.sa, r.sa ? f.svPct(r.saves / r.sa) : "–") }))} labelA={t.player.goalsAgainst} />
      </Card>
      <Card className="!p-0">
        <table className="tabular w-full text-sm">
          <thead className="text-xs text-muted"><tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>{t.common.split}</th><th>{st.gp}</th><th>{st.sv}</th><th>{st.gaa}</th></tr></thead>
          <tbody>
            {sets.map(([label, rs]) => { const s = split([...rs]); return (
              <tr key={label} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right"><td className="!text-left">{label}</td><td>{s.gp}</td><td>{f.svPct(s.sv)}</td><td>{f.num(s.gaa, 2)}</td></tr>
            ); })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
