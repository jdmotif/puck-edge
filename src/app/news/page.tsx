import { latestNews, SOURCES } from "@/lib/news";
import { TEAM_ABBREVS, teamName } from "@/lib/news/teams";
import { Empty, PageTitle, Tabs } from "@/components/ui";
import { StaleBanner } from "@/components/StaleBanner";
import { NewsList } from "@/components/NewsList";
import { TeamFilter } from "./TeamFilter";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ team?: string; source?: string }> }) {
  const q = await searchParams;
  const { t, f } = await getI18n();
  const N = t.news;
  const team = q.team && TEAM_ABBREVS.includes(q.team.toUpperCase()) ? q.team.toUpperCase() : undefined;
  const source = SOURCES.some((s) => s.id === q.source) ? q.source : undefined;
  const feed = await latestNews({ team, source });

  const href = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("source", s);
    if (team) p.set("team", team);
    return `/news${p.size ? `?${p}` : ""}`;
  };
  const tabs = [{ key: "all", label: N.all, href: href() }, ...SOURCES.map((s) => ({ key: s.id, label: s.name, href: href(s.id) }))];
  const loaded = feed.sources.filter((s) => s.fetchedAt > 0);
  const newest = Math.max(0, ...loaded.map((s) => s.fetchedAt));
  // Sources that failed with a cached copy get the stale banner; ones with nothing at all are listed below it.
  const missing = feed.sources.filter((s) => s.fetchedAt === 0);

  return (
    <>
      <PageTitle sub={N.sub(SOURCES.map((s) => s.name).join(", "), newest ? f.time(newest) : null)}>
        {N.title}{team ? ` · ${teamName(team)}` : ""}
      </PageTitle>
      <StaleBanner items={feed.sources.filter((s) => s.fetchedAt > 0)} />
      {missing.length > 0 && missing.length < SOURCES.length && (
        <p className="mb-3 text-xs text-muted">
          {N.unavailable(missing.map((s) => s.error).join("; "))}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Tabs tabs={tabs} active={source ?? "all"} />
        <TeamFilter teams={TEAM_ABBREVS.map((a) => ({ abbrev: a, name: teamName(a) }))} value={team} source={source} />
      </div>
      {feed.items.length ? (
        <NewsList items={feed.items} />
      ) : missing.length === SOURCES.length ? (
        <Empty>
          {N.failed(missing.map((s) => s.error).join("; "))}
        </Empty>
      ) : (
        <Empty>{N.empty(team ? teamName(team) : null, source ? (SOURCES.find((s) => s.id === source)?.name ?? null) : null)}</Empty>
      )}
    </>
  );
}
