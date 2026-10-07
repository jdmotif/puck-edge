import { api, todayIso } from "@/lib/nhl/client";
import type { ScheduleGame } from "@/lib/nhl/types";
import { LiveRefresh, LiveScoreText } from "@/components/LiveScore";
import { LocalTime } from "@/components/LocalTime";
import { ButtonLink, PageTitle, Tabs, TeamLogo } from "@/components/ui";
import { StaleBanner } from "@/components/StaleBanner";
import { getI18n } from "@/lib/i18n/server";
import type { Messages } from "@/lib/i18n";

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
  const { t, f } = await getI18n();
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
      ? t.schedule.weekOf(f.day(start, { month: "long", day: "numeric" }))
      : f.day(monthStart, { month: "long", year: "numeric" });
  const today = todayIso();

  return (
    <>
      <PageTitle>{t.schedule.title}</PageTitle>
      <StaleBanner items={results} />
      <LiveRefresh active={(byDay.get(today) ?? []).some((g) => g.gameState !== "OFF" && g.gameState !== "FINAL" && Date.parse(g.startTimeUTC) <= Date.now())} />
      <Tabs
        active={view}
        tabs={[
          { key: "month", label: t.schedule.month, href: link({ view: "month" }) },
          { key: "week", label: t.schedule.week, href: link({ view: "week" }) },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <ButtonLink href={link({ date: prev })} label={t.common.previous}>←</ButtonLink>
        <span className="min-w-40 text-center font-display text-xl font-bold uppercase tracking-wide">{title}</span>
        <ButtonLink href={link({ date: next })} label={t.common.next}>→</ButtonLink>
        <ButtonLink href={link({ date: today })}>{t.common.today}</ButtonLink>
        <form action="/schedule" className="ml-auto flex gap-2">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="date" value={date} />
          <select name="team" defaultValue={team ?? ""} className="border px-3 py-1.5">
            <option value="">{t.common.allTeams}</option>
            {TEAMS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button className="bg-accent px-4 py-1.5 font-semibold text-white">{t.common.filter}</button>
        </form>
      </div>

      {view === "month" ? (
        <>
          <div className="mb-1 hidden grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted md:grid">
            {t.schedule.weekdays.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid gap-1.5 md:grid-cols-7">
            {days.map((d) => {
              const inMonth = d >= monthStart && d <= monthEnd;
              const games = gamesOn(d);
              if (!inMonth) return <div key={d} className="hidden md:block" />;
              if (!games.length && team) return <div key={d} className="hidden min-h-28 rounded-xl border border-line/60 p-2 text-xs text-muted md:block">{Number(d.slice(8))}</div>;
              return (
                <div key={d} className={`min-h-28 rounded-xl border p-2 ${d === today ? "border-accent/70 bg-accent/10 shadow-[0_0_0_1px_var(--accent)_inset]" : "border-line bg-surface"}`}>
                  <div className="mb-1.5 flex items-baseline gap-1 text-xs text-muted">
                    <span className="md:hidden">{f.day(d, { weekday: "short", month: "short", day: "numeric" })}</span>
                    <span className={`hidden font-display text-base font-bold md:inline ${d === today ? "text-accent-2" : "text-ink-2"}`}>{Number(d.slice(8))}</span>
                    {games.length > 0 && <span className="ml-1">· {games.length}</span>}
                  </div>
                  <ul className="space-y-0.5">
                    {games.map((g) => <GameLine key={g.id} g={g} t={t} compact />)}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <div key={d} className={`card p-4 ${d === today ? "!border-accent/70" : ""}`}>
              <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{f.day(d, { weekday: "long", month: "short", day: "numeric" })}</h2>
              {gamesOn(d).length ? <ul className="space-y-1">{gamesOn(d).map((g) => <GameLine key={g.id} g={g} t={t} />)}</ul> : <p className="text-sm text-muted">{t.schedule.noGames}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function GameLine({ g, t, compact = false }: { g: ScheduleGame; t: Messages; compact?: boolean }) {
  const done = g.gameState === "OFF" || g.gameState === "FINAL";
  const live = g.gameState === "LIVE" || g.gameState === "CRIT";
  const score = g.awayTeam.score !== undefined && g.homeTeam.score !== undefined;
  return (
    <li>
      <a href={`/game/${g.id}`} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs hover:bg-surface-3 sm:text-sm">
        {!compact && <TeamLogo abbrev={g.awayTeam.abbrev} size={24} />}
        <span className="font-medium">{g.awayTeam.abbrev}</span>
        <span className="text-muted">@</span>
        {!compact && <TeamLogo abbrev={g.homeTeam.abbrev} size={24} />}
        <span className="font-medium">{g.homeTeam.abbrev}</span>
        <span className={`ml-auto tabular ${live ? "text-bad" : "text-muted"}`}>
          <LiveScoreText id={g.id}>
            {(done || live) && score ? `${g.awayTeam.score}–${g.homeTeam.score}${done && g.gameOutcome?.lastPeriodType !== "REG" && g.gameOutcome ? ` ${t.status.period(0, g.gameOutcome.lastPeriodType)}` : ""}` : <LocalTime iso={g.startTimeUTC} />}
          </LiveScoreText>
        </span>
      </a>
    </li>
  );
}
