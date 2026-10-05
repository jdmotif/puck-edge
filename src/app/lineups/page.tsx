import { todayIso } from "@/lib/nhl/client";
import { loadLineups, type LineupPlayer, type TeamLineup } from "@/lib/lineups";
import { LocalTime } from "@/components/LocalTime";
import { Card, Empty, PageTitle, Pill, StaleBanner, Tabs, TeamLogo } from "@/components/ui";
import { toiFmt } from "@/lib/format";

export const dynamic = "force-dynamic";

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function LineupsPage({ searchParams }: { searchParams: Promise<{ date?: string; show?: string }> }) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIso();
  const show = sp.show === "official" || sp.show === "projected" ? sp.show : "all";
  const { games, fetched } = await loadLineups(date);
  const statusOf = (g: (typeof games)[number]) => (g.away.status === "official" && g.home.status === "official" ? "official" : "projected");
  const shown = games.filter((g) => show === "all" || statusOf(g) === show);
  const nOfficial = games.filter((g) => statusOf(g) === "official").length;
  const link = (patch: Record<string, string>) => `/lineups?${new URLSearchParams({ date, show, ...patch })}`;
  const label = new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <PageTitle sub={`${label} · ${games.length} games · ${nOfficial} official, ${games.length - nOfficial} projected`}>Lineups</PageTitle>
      <StaleBanner items={fetched} />
      <div className="mb-3 flex items-center gap-2 text-sm">
        <a className="rounded-md bg-surface px-2.5 py-1.5 hover:text-accent" href={link({ date: addDays(date, -1) })}>← Prev</a>
        {date !== todayIso() && <a className="rounded-md bg-surface px-2.5 py-1.5 hover:text-accent" href={link({ date: todayIso() })}>Today</a>}
        <a className="rounded-md bg-surface px-2.5 py-1.5 hover:text-accent" href={link({ date: addDays(date, 1) })}>Next →</a>
      </div>
      <Tabs
        active={show}
        tabs={[
          { key: "all", label: "All games", href: link({ show: "all" }) },
          { key: "official", label: `Official (${nOfficial})`, href: link({ show: "official" }) },
          { key: "projected", label: `Projected (${games.length - nOfficial})`, href: link({ show: "projected" }) },
        ]}
      />
      <p className="mb-4 text-xs text-muted">
        The NHL confirms who dressed and who starts in net only once the game begins, so lineups are projected until then: the skaters
        who dressed most in each team&apos;s last 5 games (from today&apos;s active roster when the NHL has posted it), lines ordered by
        average ice time, and the goalie with the most starts in the last 10 (the backup on a back-to-back). Line combinations are never
        published by the NHL, so they&apos;re always an estimate from ice time.
      </p>
      {!shown.length ? (
        <Empty>
          {!games.length
            ? "No games on this date."
            : show === "official"
              ? "No official lineups yet. They appear here once each game starts."
              : "Every game on this date has an official lineup."}
        </Empty>
      ) : (
        <div className="space-y-4">
          {shown.map(({ game, away, home }) => (
            <Card key={game.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <a href={`/game/${game.id}`} className="flex items-center gap-2 font-semibold hover:text-accent">
                  <TeamLogo abbrev={away.team} size={24} /> {away.team} @ {home.team} <TeamLogo abbrev={home.team} size={24} />
                </a>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <LocalTime iso={game.startTimeUTC} />
                  {statusOf({ game, away, home }) === "official" ? <Pill tone="good">Official</Pill> : <Pill tone="warn">Projected</Pill>}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TeamColumn t={away} />
                <TeamColumn t={home} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Name({ p }: { p: LineupPlayer }) {
  return (
    <a href={`/players/${p.id}`} className="block min-w-0 truncate hover:text-accent" title={p.name}>
      {p.number !== undefined && <span className="tabular mr-1 hidden text-muted sm:inline">{p.number}</span>}
      {p.name}
      {p.toiSec !== null && <span className="tabular ml-1 hidden text-[11px] text-muted sm:inline">{toiFmt(p.toiSec)}</span>}
    </a>
  );
}

function TeamColumn({ t }: { t: TeamLineup }) {
  const official = t.status === "official";
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <TeamLogo abbrev={t.team} size={20} />
        <span className="font-semibold">{t.team}</span>
        <span className="text-xs text-muted">
          {official
            ? "Dressed roster from the NHL"
            : t.rosterSource === "game-day"
              ? `Today's active roster · last ${t.gamesUsed} games`
              : `Team roster (game-day roster not posted yet) · last ${t.gamesUsed} games`}
        </span>
      </div>

      <div className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wide text-muted">Goalie</span>
          {official ? <Pill tone="good">Confirmed</Pill> : <Pill tone={t.goalieNote.startsWith("Back-to-back") ? "bad" : "warn"}>Projected</Pill>}
        </div>
        {t.goalie ? (
          <>
            <a href={`/players/${t.goalie.id}`} className="font-medium hover:text-accent">{t.goalie.name}</a>
            <div className="text-xs text-muted">
              {t.goalieNote}
              {t.backup && <> · backup {t.backup.name}</>}
            </div>
          </>
        ) : (
          <div className="text-muted">TBD</div>
        )}
      </div>

      <table className="w-full table-fixed text-xs sm:text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-muted">
          <tr className="[&>th]:px-1 [&>th]:pb-1 [&>th]:text-left [&>th]:font-normal">
            <th className="w-8"></th>
            <th>LW</th>
            <th>C</th>
            <th>RW</th>
          </tr>
        </thead>
        <tbody>
          {t.forwards.map((line, i) => (
            <tr key={i} className="border-t border-line [&>td]:px-1 [&>td]:py-1">
              <td className="text-xs text-muted">L{i + 1}</td>
              {line.map((p) => (
                <td key={p.id}><Name p={p} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <table className="mt-2 w-full table-fixed text-xs sm:text-sm">
        <tbody>
          {t.defense.map((pair, i) => (
            <tr key={i} className="border-t border-line [&>td]:px-1 [&>td]:py-1">
              <td className="w-8 text-xs text-muted">D{i + 1}</td>
              {pair.map((p) => (
                <td key={p.id}><Name p={p} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.extras.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Likely out of the lineup: {t.extras.map((p) => `${p.name} (${p.pos})`).join(", ")}
        </p>
      )}
    </div>
  );
}
