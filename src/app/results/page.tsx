import { sqlite } from "@/db";
import { seasonFor, todayIso } from "@/lib/nhl/client";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import type { GoalSummary, StarSummary } from "@/lib/data/ingest";
import { Card, Empty, PageTitle, Pill, TeamLogo } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  date: string;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  lastPeriodType: string;
  gameType: number;
  goals: string | null;
  stars: string | null;
}

const PAGE = 40;

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  refreshRecentInBackground();
  const sp = await searchParams;
  const season = Number(sp.season) || seasonFor(todayIso());
  const team = sp.team?.toUpperCase();
  const type = sp.type; // REG | OT | SO
  const from = sp.from;
  const to = sp.to;
  const page = Math.max(1, Number(sp.page) || 1);

  const where = ["g.season = @season", "g.game_type IN (2, 3)"];
  if (team) where.push("(g.home = @team OR g.away = @team)");
  if (type) where.push("g.last_period_type = @type");
  if (from) where.push("g.date >= @from");
  if (to) where.push("g.date <= @to");
  const params = { season, team, type, from, to };
  const total = (sqlite.prepare(`SELECT COUNT(*) AS n FROM games g WHERE ${where.join(" AND ")}`).get(params) as { n: number }).n;
  const rows = sqlite
    .prepare(
      `SELECT g.id, g.date, g.away, g.home, g.away_score AS awayScore, g.home_score AS homeScore, g.last_period_type AS lastPeriodType,
        g.game_type AS gameType, d.goals, d.stars
       FROM games g LEFT JOIN game_details d ON d.game_id = g.id
       WHERE ${where.join(" AND ")} ORDER BY g.date DESC, g.id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
    )
    .all(params) as Row[];
  const teams = (sqlite.prepare("SELECT home AS t FROM games WHERE season = ? UNION SELECT away FROM games WHERE season = ? ORDER BY t").all(season, season) as { t: string }[]).map((r) => r.t);
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/results?${p}`;
  };

  const byDate = new Map<string, Row[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);

  return (
    <>
      <PageTitle sub={`${total} completed games${team ? ` for ${team}` : ""} in ${String(season).slice(0, 4)}–${String(season).slice(6)}`}>Results</PageTitle>
      <form className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5" action="/results">
        <select name="team" defaultValue={team ?? ""} className="rounded-md border border-line bg-surface px-2 py-1.5">
          <option value="">All teams</option>
          {teams.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select name="type" defaultValue={type ?? ""} className="rounded-md border border-line bg-surface px-2 py-1.5">
          <option value="">All results</option>
          <option value="REG">Regulation</option>
          <option value="OT">Overtime</option>
          <option value="SO">Shootout</option>
        </select>
        <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-md border border-line bg-surface px-2 py-1.5" />
        <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-md border border-line bg-surface px-2 py-1.5" />
        <button className="rounded-md bg-accent px-3 py-1.5 font-medium text-white">Filter</button>
      </form>

      {!rows.length ? (
        <Empty>
          No completed games stored yet. Run <code className="text-ink">npm run sync</code> to backfill the season (games from the last two days are pulled in automatically).
        </Empty>
      ) : (
        <div className="space-y-5">
          {[...byDate.entries()].map(([date, games]) => (
            <div key={date}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {games.map((g) => {
                  const goals: GoalSummary[] = g.goals ? JSON.parse(g.goals) : [];
                  const stars: StarSummary[] = g.stars ? JSON.parse(g.stars) : [];
                  const awayWon = g.awayScore > g.homeScore;
                  return (
                    <Card key={g.id} className="!p-3">
                      <a href={`/game/${g.id}`} className="block">
                        {[{ t: g.away, s: g.awayScore, w: awayWon }, { t: g.home, s: g.homeScore, w: !awayWon }].map((x) => (
                          <div key={x.t} className={`flex items-center gap-2 py-0.5 ${x.w ? "font-semibold" : "text-ink-2"}`}>
                            <TeamLogo abbrev={x.t} size={22} />
                            <span className="flex-1">{x.t}</span>
                            <span className="tabular text-lg">{x.s}</span>
                          </div>
                        ))}
                      </a>
                      <div className="mt-1 flex gap-2">
                        <Pill tone={g.lastPeriodType === "REG" ? "neutral" : "accent"}>{g.lastPeriodType === "REG" ? "Final" : `Final/${g.lastPeriodType}`}</Pill>
                        {g.gameType === 3 && <Pill tone="warn">Playoffs</Pill>}
                      </div>
                      {goals.length > 0 && (
                        <p className="mt-2 text-xs leading-relaxed text-ink-2">
                          <span className="text-muted">Goals: </span>
                          {goals.filter((x) => x.periodType !== "SO").map((x, i) => (
                            <span key={i}>{i > 0 && ", "}{x.scorer} ({x.team}{x.strength !== "ev" ? ` ${x.strength.toUpperCase()}` : ""})</span>
                          ))}
                        </p>
                      )}
                      {stars.length > 0 && (
                        <p className="mt-1 text-xs text-ink-2">
                          <span className="text-muted">Stars: </span>
                          {stars.map((s) => `${"★".repeat(s.star)} ${s.name} (${s.line})`).join(" · ")}
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex justify-between text-sm">
            {page > 1 ? <a className="text-accent" href={qs({ page: page - 1 })}>← Newer</a> : <span />}
            {page * PAGE < total ? <a className="text-accent" href={qs({ page: page + 1 })}>Older →</a> : <span />}
          </div>
        </div>
      )}
    </>
  );
}
