import { sqlite } from "@/db";
import { seasonFor, todayIso } from "@/lib/nhl/client";
import { refreshRecentInBackground } from "@/lib/data/refresh";
import type { GoalSummary, StarSummary } from "@/lib/data/ingest";
import { ButtonLink, Card, Empty, PageTitle, Pill, Rich, TeamLogo } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

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
  const { t, f } = await getI18n();
  const R = t.results;
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
      <PageTitle sub={R.sub(total, team, f.season(season))}>{R.title}</PageTitle>
      <form className="card mb-5 grid grid-cols-2 gap-2 p-3 text-sm sm:grid-cols-5" action="/results">
        <select name="team" defaultValue={team ?? ""} className="border px-3 py-2">
          <option value="">{t.common.allTeams}</option>
          {teams.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select name="type" defaultValue={type ?? ""} className="border px-3 py-2">
          <option value="">{R.allResults}</option>
          <option value="REG">{R.reg}</option>
          <option value="OT">{R.ot}</option>
          <option value="SO">{R.so}</option>
        </select>
        <input type="date" name="from" defaultValue={from} aria-label={R.from} className="border px-3 py-2" />
        <input type="date" name="to" defaultValue={to} aria-label={R.to} className="border px-3 py-2" />
        <button className="bg-accent px-3 py-2 font-semibold text-white">{t.common.filter}</button>
      </form>

      {!rows.length ? (
        <Empty>
          <Rich text={R.empty} />
        </Empty>
      ) : (
        <div className="space-y-5">
          {[...byDate.entries()].map(([date, games]) => (
            <div key={date}>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{f.day(date, { weekday: "long", month: "long", day: "numeric" })}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {games.map((g) => {
                  const goals: GoalSummary[] = g.goals ? JSON.parse(g.goals) : [];
                  const stars: StarSummary[] = g.stars ? JSON.parse(g.stars) : [];
                  const awayWon = g.awayScore > g.homeScore;
                  return (
                    <Card key={g.id} className="card-hover !p-4">
                      <a href={`/game/${g.id}`} className="block">
                        {[{ t: g.away, s: g.awayScore, w: awayWon }, { t: g.home, s: g.homeScore, w: !awayWon }].map((x) => (
                          <div key={x.t} className={`flex items-center gap-2 py-0.5 ${x.w ? "text-ink" : "text-muted"}`}>
                            <TeamLogo abbrev={x.t} size={30} />
                            <span className="flex-1 font-display text-lg uppercase tracking-wide">{x.t}</span>
                            <span className="font-display tabular text-2xl font-bold">{x.s}</span>
                          </div>
                        ))}
                      </a>
                      <div className="mt-2 flex gap-2">
                        <Pill tone={g.lastPeriodType === "REG" ? "neutral" : "accent"}>{t.status.final(g.lastPeriodType)}</Pill>
                        {g.gameType === 3 && <Pill tone="warn">{t.common.playoffs}</Pill>}
                      </div>
                      {goals.length > 0 && (
                        <p className="mt-2 text-xs leading-relaxed text-ink-2">
                          <span className="text-muted">{R.goals}</span>
                          {goals.filter((x) => x.periodType !== "SO").map((x, i) => (
                            <span key={i}>{i > 0 && ", "}{x.scorer} ({x.team}{x.strength !== "ev" ? ` ${t.stats.strength(x.strength)}` : ""})</span>
                          ))}
                        </p>
                      )}
                      {stars.length > 0 && (
                        <p className="mt-1 text-xs text-ink-2">
                          <span className="text-muted">{R.stars}</span>
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
            {page > 1 ? <ButtonLink href={qs({ page: page - 1 })}>{R.newer}</ButtonLink> : <span />}
            {page * PAGE < total ? <ButtonLink href={qs({ page: page + 1 })}>{R.older}</ButtonLink> : <span />}
          </div>
        </div>
      )}
    </>
  );
}
