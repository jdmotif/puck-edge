import { sqlite } from "@/db";
import { api } from "@/lib/nhl/client";
import { Card, Empty, Pill, StaleBanner, StatTile, TEAM_COLORS, TeamLogo } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { svPct, toiFmt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params, searchParams }: { params: Promise<{ abbrev: string }>; searchParams: Promise<{ vs?: string }> }) {
  const team = (await params).abbrev.toUpperCase();
  const { vs } = await searchParams;
  const [standings, stats, roster, sched] = await Promise.all([api.standings("now"), api.clubStats(team), api.roster(team), api.clubSchedule(team)]);
  const row = standings.data?.standings.find((s) => s.teamAbbrev.default === team);
  const games = sched.data?.games.filter((g) => g.gameType === 2 || g.gameType === 3) ?? [];
  const done = games.filter((g) => g.gameState === "OFF" || g.gameState === "FINAL");
  const upcoming = games.filter((g) => !(g.gameState === "OFF" || g.gameState === "FINAL"));
  const opponents = [...new Set(games.flatMap((g) => [g.homeTeam.abbrev, g.awayTeam.abbrev]))].filter((t) => t !== team).sort();
  const h2h = vs
    ? (sqlite
        .prepare(
          `SELECT id, date, home, away, home_score AS hs, away_score AS as_, last_period_type AS lpt FROM games
           WHERE (home = ? AND away = ?) OR (home = ? AND away = ?) ORDER BY date DESC`,
        )
        .all(team, vs, vs, team) as { id: number; date: string; home: string; away: string; hs: number; as_: number; lpt: string }[])
    : [];
  const h2hWins = h2h.filter((g) => (g.home === team ? g.hs > g.as_ : g.as_ > g.hs)).length;
  const skaters = [...(stats.data?.skaters ?? [])].sort((a, b) => b.points - a.points);

  return (
    <>
      <div
        className="card relative mb-5 flex items-center gap-4 overflow-hidden px-5 py-5 sm:px-6"
        style={{ background: `linear-gradient(110deg, color-mix(in srgb, ${TEAM_COLORS[team] ?? "#3d6bff"} 30%, var(--surface)) 0%, var(--surface) 65%)` }}
      >
        <TeamLogo abbrev={team} size={72} />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-2">{row ? `${row.conferenceName} · ${row.divisionName}` : "NHL"}</div>
          <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-wide sm:text-4xl">{row?.teamName.default ?? team}</h1>
          {row && <p className="tabular mt-1.5 text-sm text-ink-2">{row.wins}-{row.losses}-{row.otLosses} · <span className="font-semibold text-ink">{row.points} pts</span></p>}
        </div>
      </div>
      <StaleBanner items={[standings, stats, roster, sched]} />

      {row && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Goals/game", (row.goalFor / Math.max(1, row.gamesPlayed)).toFixed(2)],
            ["Against/game", (row.goalAgainst / Math.max(1, row.gamesPlayed)).toFixed(2)],
            ["Home", `${row.homeWins}-${row.homeLosses}-${row.homeOtLosses} (${row.homeGoalsFor}–${row.homeGoalsAgainst})`],
            ["Road", `${row.roadWins}-${row.roadLosses}-${row.roadOtLosses} (${row.roadGoalsFor}–${row.roadGoalsAgainst})`],
            ["Last 10", `${row.l10Wins}-${row.l10Losses}-${row.l10OtLosses}`],
            ["Streak", row.streakCode ? `${row.streakCode}${row.streakCount}` : "–"],
            ["Goal diff", `${row.goalDifferential > 0 ? "+" : ""}${row.goalDifferential}`],
            ["League rank", `#${row.leagueSequence}`],
          ].map(([k, v]) => (
            <StatTile key={k} label={k} value={v} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="overflow-x-auto !p-0">
            <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">Skaters</h2>
            {skaters.length ? (
              <table className="tabular mt-2 w-full min-w-[560px] text-sm">
                <thead className="text-xs text-muted">
                  <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left">
                    <th>Player</th><th>Pos</th><th>GP</th><th>G</th><th>A</th><th>P</th><th>PPG</th><th>SOG</th><th>TOI</th><th>+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {skaters.map((s) => (
                    <tr key={s.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
                      <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${s.playerId}`}>{s.firstName.default} {s.lastName.default}</a></td>
                      <td className="text-muted">{s.positionCode}</td><td>{s.gamesPlayed}</td><td>{s.goals}</td><td>{s.assists}</td>
                      <td className="font-semibold">{s.points}</td><td>{s.powerPlayGoals}</td><td>{s.shots}</td><td>{toiFmt(s.avgTimeOnIcePerGame)}</td>
                      <td>{s.plusMinus > 0 ? "+" : ""}{s.plusMinus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="p-3 text-sm text-muted">No stats yet.</p>}
            <h2 className="mt-4 px-3 font-display text-lg font-bold uppercase tracking-wide">Goalies</h2>
            <table className="tabular mt-2 mb-2 w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>Goalie</th><th>GP</th><th>GS</th><th>W-L-OT</th><th>SV%</th><th>GAA</th><th>SO</th></tr>
              </thead>
              <tbody>
                {(stats.data?.goalies ?? []).map((g) => (
                  <tr key={g.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
                    <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${g.playerId}`}>{g.firstName.default} {g.lastName.default}</a></td>
                    <td>{g.gamesPlayed}</td><td>{g.gamesStarted}</td><td>{g.wins}-{g.losses}-{g.overtimeLosses}</td>
                    <td>{svPct(g.savePercentage)}</td><td>{g.goalsAgainstAverage.toFixed(2)}</td><td>{g.shutouts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Head to head (stored games, this and last season)</h2>
            <form className="mb-3 flex gap-2 text-sm">
              <select name="vs" defaultValue={vs ?? ""} className="rounded-md border border-line bg-surface-2 px-2 py-1">
                <option value="">Pick an opponent</option>
                {opponents.map((o) => <option key={o}>{o}</option>)}
              </select>
              <button className="rounded-md bg-accent px-3 py-1 text-white">Show</button>
            </form>
            {vs && (h2h.length ? (
              <>
                <p className="mb-2 text-sm">{team} {h2hWins}–{h2h.length - h2hWins} vs {vs}</p>
                <ul className="space-y-1 text-sm">
                  {h2h.map((g) => (
                    <li key={g.id}><a className="flex gap-2 hover:text-accent-2" href={`/game/${g.id}`}>
                      <span className="w-24 text-muted">{g.date}</span>
                      <span>{g.away} {g.as_} @ {g.home} {g.hs}{g.lpt !== "REG" ? ` (${g.lpt})` : ""}</span>
                    </a></li>
                  ))}
                </ul>
              </>
            ) : <p className="text-sm text-muted">No stored games between {team} and {vs}. Run the backfill first.</p>)}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Upcoming</h2>
            {upcoming.length ? (
              <ul className="space-y-1 text-sm">
                {upcoming.slice(0, 10).map((g) => (
                  <li key={g.id}><a href={`/game/${g.id}`} className="flex justify-between hover:text-accent-2">
                    <span>{g.homeTeam.abbrev === team ? `vs ${g.awayTeam.abbrev}` : `@ ${g.homeTeam.abbrev}`}</span>
                    <span className="text-muted"><LocalTime iso={g.startTimeUTC} format="datetime" /></span>
                  </a></li>
                ))}
              </ul>
            ) : <Empty>No upcoming games.</Empty>}
          </Card>
          <Card>
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Recent</h2>
            <ul className="space-y-1 text-sm">
              {done.slice(-10).reverse().map((g) => {
                const home = g.homeTeam.abbrev === team;
                const us = home ? g.homeTeam.score : g.awayTeam.score;
                const them = home ? g.awayTeam.score : g.homeTeam.score;
                const won = (us ?? 0) > (them ?? 0);
                return (
                  <li key={g.id}><a href={`/game/${g.id}`} className="flex items-center justify-between hover:text-accent-2">
                    <span>{home ? `vs ${g.awayTeam.abbrev}` : `@ ${g.homeTeam.abbrev}`}</span>
                    <span className="flex items-center gap-2 tabular">
                      <Pill tone={won ? "good" : "bad"}>{won ? "W" : g.gameOutcome?.lastPeriodType !== "REG" ? "OTL" : "L"}</Pill>
                      {us}–{them}
                    </span>
                  </a></li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Roster</h2>
            {(["forwards", "defensemen", "goalies"] as const).map((k) => (
              <div key={k} className="mb-2">
                <div className="text-xs uppercase text-muted">{k}</div>
                <ul className="text-sm">
                  {(roster.data?.[k] ?? []).map((p) => (
                    <li key={p.id}><a className="hover:text-accent-2" href={`/players/${p.id}`}><span className="inline-block w-7 text-muted tabular">{p.sweaterNumber ?? ""}</span>{p.firstName.default} {p.lastName.default}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
