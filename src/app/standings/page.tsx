import { api } from "@/lib/nhl/client";
import { Empty, PageTitle, StaleBanner, Tabs } from "@/components/ui";
import { StandingsTable } from "@/components/StandingsTable";
import type { StandingRow } from "@/lib/nhl/types";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const byPoints = (a: StandingRow, b: StandingRow) => a.leagueSequence - b.leagueSequence;

export default async function StandingsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "wildcard" } = await searchParams;
  const { t, f } = await getI18n();
  const S = t.standings;
  const res = await api.standings("now");
  const rows = res.data?.standings ?? [];
  const tabs = [
    { key: "wildcard", label: S.wildcard, href: "/standings?view=wildcard" },
    { key: "division", label: S.division, href: "/standings?view=division" },
    { key: "conference", label: S.conference, href: "/standings?view=conference" },
    { key: "league", label: S.league, href: "/standings?view=league" },
  ];
  const confs = [...new Set(rows.map((r) => r.conferenceName))].sort();
  const divs = (conf: string) => [...new Set(rows.filter((r) => r.conferenceName === conf).map((r) => r.divisionName))].sort();

  return (
    <>
      <PageTitle sub={res.data ? S.asOf(f.dateTime(Date.parse(res.data.standingsDateTimeUtc))) : undefined}>{S.title}</PageTitle>
      <StaleBanner items={[res]} />
      <Tabs tabs={tabs} active={view} />
      {!rows.length ? (
        <Empty>{S.empty}</Empty>
      ) : view === "league" ? (
        <StandingsTable rows={[...rows].sort(byPoints)} />
      ) : view === "conference" ? (
        <div className="space-y-4">
          {confs.map((c) => (
            <StandingsTable key={c} title={S.conferenceName(c)} rows={rows.filter((r) => r.conferenceName === c).sort((a, b) => a.conferenceSequence - b.conferenceSequence)} cutAfter={8} />
          ))}
        </div>
      ) : view === "division" ? (
        <div className="space-y-4">
          {confs.flatMap((c) => divs(c)).map((d) => (
            <StandingsTable key={d} title={S.divisionName(d)} rows={rows.filter((r) => r.divisionName === d).sort((a, b) => a.divisionSequence - b.divisionSequence)} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {confs.map((c) => {
            const inConf = rows.filter((r) => r.conferenceName === c);
            const top3 = divs(c).map((d) => inConf.filter((r) => r.divisionName === d && r.divisionSequence <= 3).sort((a, b) => a.divisionSequence - b.divisionSequence));
            const wild = inConf.filter((r) => r.divisionSequence > 3).sort((a, b) => a.wildcardSequence - b.wildcardSequence || a.conferenceSequence - b.conferenceSequence);
            return (
              <div key={c} className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-2">{S.conferenceName(c)}</h2>
                {top3.map((d, i) => (
                  <StandingsTable key={i} title={d[0] ? S.divisionName(d[0].divisionName) : undefined} rows={d} />
                ))}
                <StandingsTable title={S.wildcard} rows={wild} cutAfter={2} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
