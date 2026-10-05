import { api, todayIso } from "@/lib/nhl/client";
import type { ScheduleGame } from "@/lib/nhl/types";
import { LocalTime } from "@/components/LocalTime";
import { PageTitle, StaleBanner, Tabs, TeamLogo } from "@/components/ui";

export const dynamic = "force-dynamic";

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
};
const TEAMS = "ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH".split(" ");

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "month";
  const date = sp.date ?? todayIso();
  const team = sp.team?.toUpperCase();

  let start: string, end: string, monthStart = "", monthEnd = "";
  if (view === "week") {
    start = mondayOf(date);
    end = addDays(start, 6);
  } else {
    monthStart = date.slice(0, 8) + "01";
    const next = new Date(monthStart + "T12:00:00Z");
    next.setUTCMonth(next.getUTCMonth() + 1);
    monthEnd = addDays(next.toISOString().slice(0, 10), -1);
    start = mondayOf(monthStart);
    end = addDays(mondayOf(monthEnd), 6);
  }

  const weekStarts: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weekStarts.push(d);
  const results = await Promise.all(weekStarts.map((d) => api.schedule(d)));
  const byDay = new Map<string, ScheduleGame[]>();
  for (const r of results) for (const day of r.data?.gameWeek ?? []) byDay.set(day.date, day.games);
  const gamesOn = (d: string) => (byDay.get(d) ?? []).filter((g) => !team || g.homeTeam.abbrev === team || g.awayTeam.abbrev === team);

  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const prev = view === "week" ? addDays(start, -7) : addDays(monthStart, -1).slice(0, 8) + "01";
  const next = view === "week" ? addDays(start, 7) : addDays(monthEnd, 1);
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, date, team, ...patch })) if (v) p.set(k, v);
    return `/schedule?${p}`;
  };
  const title =
    view === "week"
      ? `Week of ${new Date(start + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}`
      : new Date(monthStart + "T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = todayIso();

  return (
    <>
      <PageTitle>Schedule</PageTitle>
      <StaleBanner items={results} />
      <Tabs
        active={view}
        tabs={[
          { key: "month", label: "Month", href: link({ view: "month" }) },
          { key: "week", label: "Week", href: link({ view: "week" }) },
        ]}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <a href={link({ date: prev })} className="rounded-md border border-line px-2 py-1">←</a>
        <span className="min-w-40 text-center font-medium">{title}</span>
        <a href={link({ date: next })} className="rounded-md border border-line px-2 py-1">→</a>
        <a href={link({ date: today })} className="rounded-md border border-line px-2 py-1">Today</a>
        <form action="/schedule" className="ml-auto flex gap-2">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="date" value={date} />
          <select name="team" defaultValue={team ?? ""} className="rounded-md border border-line bg-surface px-2 py-1">
            <option value="">All teams</option>
            {TEAMS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button className="rounded-md bg-accent px-3 py-1 text-white">Filter</button>
        </form>
      </div>

      {view === "month" ? (
        <>
          <div className="hidden grid-cols-7 gap-1 text-center text-xs text-muted md:grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid gap-1 md:grid-cols-7">
            {days.map((d) => {
              const inMonth = d >= monthStart && d <= monthEnd;
              const games = gamesOn(d);
              if (!inMonth) return <div key={d} className="hidden md:block" />;
              if (!games.length && team) return <div key={d} className="hidden min-h-24 rounded-lg border border-line/50 p-1.5 text-xs text-muted md:block">{Number(d.slice(8))}</div>;
              return (
                <div key={d} className={`min-h-24 rounded-lg border p-1.5 ${d === today ? "border-accent" : "border-line"} bg-surface`}>
                  <div className="mb-1 text-xs text-muted">
                    <span className="md:hidden">{new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                    <span className="hidden md:inline">{Number(d.slice(8))}</span>
                    {games.length > 0 && <span className="ml-1">· {games.length}</span>}
                  </div>
                  <ul className="space-y-0.5">
                    {games.map((g) => <GameLine key={g.id} g={g} compact />)}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d} className={`rounded-xl border bg-surface p-3 ${d === today ? "border-accent" : "border-line"}`}>
              <h2 className="mb-2 text-sm font-semibold">{new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</h2>
              {gamesOn(d).length ? <ul className="space-y-1">{gamesOn(d).map((g) => <GameLine key={g.id} g={g} />)}</ul> : <p className="text-sm text-muted">No games</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function GameLine({ g, compact = false }: { g: ScheduleGame; compact?: boolean }) {
  const done = g.gameState === "OFF" || g.gameState === "FINAL";
  const live = g.gameState === "LIVE" || g.gameState === "CRIT";
  const score = g.awayTeam.score !== undefined && g.homeTeam.score !== undefined;
  return (
    <li>
      <a href={`/game/${g.id}`} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-surface-2 sm:text-sm">
        {!compact && <TeamLogo abbrev={g.awayTeam.abbrev} size={18} />}
        <span className="font-medium">{g.awayTeam.abbrev}</span>
        <span className="text-muted">@</span>
        {!compact && <TeamLogo abbrev={g.homeTeam.abbrev} size={18} />}
        <span className="font-medium">{g.homeTeam.abbrev}</span>
        <span className={`ml-auto tabular ${live ? "text-bad" : "text-muted"}`}>
          {(done || live) && score ? `${g.awayTeam.score}–${g.homeTeam.score}${done && g.gameOutcome?.lastPeriodType !== "REG" && g.gameOutcome ? ` ${g.gameOutcome.lastPeriodType}` : ""}` : <LocalTime iso={g.startTimeUTC} />}
        </span>
      </a>
    </li>
  );
}
