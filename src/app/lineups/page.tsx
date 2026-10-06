import { todayIso } from "@/lib/nhl/client";
import { loadLineups, type LineupPlayer, type TeamLineup } from "@/lib/lineups";
import { LocalTime } from "@/components/LocalTime";
import { ButtonLink, Card, Empty, PageTitle, Pill, StaleBanner, Tabs, TeamLogo } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import type { I18n, Messages } from "@/lib/i18n";
import type { GoalieWhy } from "@/lib/lineups";

function goalieNote(t: Messages, w: GoalieWhy) {
  switch (w.kind) {
    case "b2b":
      return t.lineups.note.b2b(w.starter, w.backup);
    case "starts":
      return t.lineups.note.starts(w.starts, w.window);
    default:
      return t.lineups.note[w.kind]();
  }
}

export const dynamic = "force-dynamic";

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function LineupsPage({ searchParams }: { searchParams: Promise<{ date?: string; show?: string }> }) {
  const sp = await searchParams;
  const i = await getI18n();
  const { t, f } = i;
  const L = t.lineups;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIso();
  const show = sp.show === "official" || sp.show === "projected" ? sp.show : "all";
  const { games, fetched } = await loadLineups(date);
  const statusOf = (g: (typeof games)[number]) => (g.away.status === "official" && g.home.status === "official" ? "official" : "projected");
  const shown = games.filter((g) => show === "all" || statusOf(g) === show);
  const nOfficial = games.filter((g) => statusOf(g) === "official").length;
  const link = (patch: Record<string, string>) => `/lineups?${new URLSearchParams({ date, show, ...patch })}`;
  const label = f.day(date, { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <PageTitle sub={L.sub(label, games.length, nOfficial)}>{L.title}</PageTitle>
      <StaleBanner items={fetched} />
      <div className="mb-3 flex items-center gap-2 text-sm">
        <ButtonLink href={link({ date: addDays(date, -1) })}>{t.common.prev}</ButtonLink>
        {date !== todayIso() && <ButtonLink href={link({ date: todayIso() })}>{t.common.today}</ButtonLink>}
        <ButtonLink href={link({ date: addDays(date, 1) })}>{t.common.nextArrow}</ButtonLink>
      </div>
      <Tabs
        active={show}
        tabs={[
          { key: "all", label: L.all, href: link({ show: "all" }) },
          { key: "official", label: L.official(nOfficial), href: link({ show: "official" }) },
          { key: "projected", label: L.projected(games.length - nOfficial), href: link({ show: "projected" }) },
        ]}
      />
      <p className="mb-4 text-xs text-muted">
        {L.explain}
      </p>
      {!shown.length ? (
        <Empty>
          {!games.length
            ? L.noGames
            : show === "official"
              ? L.noOfficial
              : L.allOfficial}
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
                  {statusOf({ game, away, home }) === "official" ? (
                    <Pill tone="good">{L.officialPill}</Pill>
                  ) : away.rosterSource === "dressed-pregame" && home.rosterSource === "dressed-pregame" ? (
                    <Pill tone="accent">{L.skatersConfirmedPill}</Pill>
                  ) : (
                    <Pill tone="warn">{L.projectedPill}</Pill>
                  )}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TeamColumn t={away} i={i} />
                <TeamColumn t={home} i={i} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Name({ p, toi }: { p: LineupPlayer; toi: (s: number) => string }) {
  return (
    <a href={`/players/${p.id}`} className="block min-w-0 truncate hover:text-accent" title={p.name}>
      {p.number !== undefined && <span className="tabular mr-1 hidden text-muted sm:inline">{p.number}</span>}
      {p.name}
      {p.toiSec !== null && <span className="tabular ml-1 hidden text-[11px] text-muted sm:inline">{toi(p.toiSec)}</span>}
    </a>
  );
}

function TeamColumn({ t, i: { t: m, f } }: { t: TeamLineup; i: I18n }) {
  const L = m.lineups;
  const official = t.status === "official";
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <TeamLogo abbrev={t.team} size={20} />
        <span className="font-semibold">{t.team}</span>
        <span className="text-xs text-muted">
          {official
            ? L.dressed
            : t.rosterSource === "dressed-pregame"
              ? L.dressedPregame
              : t.rosterSource === "game-day"
                ? L.gameDay(t.gamesUsed)
                : L.teamRoster(t.gamesUsed)}
        </span>
      </div>

      <div className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wide text-muted">{L.goalie}</span>
          {official ? <Pill tone="good">{L.confirmed}</Pill> : <Pill tone={t.goalieWhy.kind === "b2b" ? "bad" : "warn"}>{L.projectedPill}</Pill>}
        </div>
        {t.goalie ? (
          <>
            <a href={`/players/${t.goalie.id}`} className="font-medium hover:text-accent">{t.goalie.name}</a>
            <div className="text-xs text-muted">
              {goalieNote(m, t.goalieWhy)}
              {t.backup && L.backup(t.backup.name)}
            </div>
          </>
        ) : (
          <div className="text-muted">{m.common.tbd}</div>
        )}
      </div>

      <table className="w-full table-fixed text-xs sm:text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-muted">
          <tr className="[&>th]:px-1 [&>th]:pb-1 [&>th]:text-left [&>th]:font-normal">
            <th className="w-8"></th>
            {L.cols.map((c) => <th key={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {t.forwards.map((line, i) => (
            <tr key={i} className="border-t border-line [&>td]:px-1 [&>td]:py-1">
              <td className="text-xs text-muted">{L.line(i + 1)}</td>
              {line.map((p) => (
                <td key={p.id}><Name p={p} toi={f.toi} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <table className="mt-2 w-full table-fixed text-xs sm:text-sm">
        <tbody>
          {t.defense.map((pair, i) => (
            <tr key={i} className="border-t border-line [&>td]:px-1 [&>td]:py-1">
              <td className="w-8 text-xs text-muted">{L.pair(i + 1)}</td>
              {pair.map((p) => (
                <td key={p.id}><Name p={p} toi={f.toi} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.extras.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {L.extras(t.extras.map((p) => `${p.name} (${m.stats.position(p.pos)})`).join(", "))}
        </p>
      )}
    </div>
  );
}
