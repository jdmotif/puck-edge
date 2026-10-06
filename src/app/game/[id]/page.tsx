import { Suspense } from "react";
import { sqlite } from "@/db";
import { api } from "@/lib/nhl/client";
import { buildSlate } from "@/lib/picks";
import type { BoxTeamStats } from "@/lib/nhl/types";
import { GameCardView } from "@/components/GameCardView";
import { LocalTime } from "@/components/LocalTime";
import { Card, Empty, Pill, SkeletonCards, StaleBanner, TEAM_COLORS, TeamLogo } from "@/components/ui";
import type { Market } from "@/lib/grading";
import { getI18n } from "@/lib/i18n/server";
import { pickLabel, type I18n } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const { t } = await getI18n();
  const landing = await api.landing(id);
  const l = landing.data;
  if (!l) return <><StaleBanner items={[landing]} /><Empty>{t.game.notLoaded}</Empty></>;
  const pre = l.gameState === "FUT" || l.gameState === "PRE";
  return (
    <>
      <StaleBanner items={[landing]} />
      <header
        className="card relative mb-5 overflow-hidden px-4 py-6 sm:px-8"
        style={{ background: `linear-gradient(100deg, color-mix(in srgb, ${TEAM_COLORS[l.awayTeam.abbrev] ?? "#3d6bff"} 26%, var(--surface)) 0%, var(--surface) 42%, var(--surface) 58%, color-mix(in srgb, ${TEAM_COLORS[l.homeTeam.abbrev] ?? "#3d6bff"} 26%, var(--surface)) 100%)` }}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <a href={`/teams/${l.awayTeam.abbrev}`} className="flex flex-col items-center gap-2 sm:flex-row sm:justify-end sm:gap-4">
            <span className="order-2 text-center sm:order-1 sm:text-right">
              <span className="block font-display text-2xl font-bold uppercase leading-none tracking-wide sm:text-3xl">{l.awayTeam.abbrev}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t.game.away}</span>
            </span>
            <span className="order-1 sm:order-2"><TeamLogo abbrev={l.awayTeam.abbrev} size={64} /></span>
          </a>
          <div className="px-2 text-center">
            {pre ? (
              <div className="font-display text-lg font-bold uppercase tracking-wide text-ink-2 sm:text-xl"><LocalTime iso={l.startTimeUTC} format="datetime" /></div>
            ) : (
              <div className="font-display tabular text-5xl font-bold leading-none sm:text-6xl">{l.awayTeam.score ?? 0}<span className="px-2 text-muted">–</span>{l.homeTeam.score ?? 0}</div>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted">
              {l.gameState === "OFF" || l.gameState === "FINAL" ? (
                <Pill>{t.status.final(l.gameOutcome?.lastPeriodType)}</Pill>
              ) : l.gameState === "LIVE" || l.gameState === "CRIT" ? (
                <Pill tone="bad"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bad" />{t.common.live}</Pill>
              ) : <Pill tone="accent">{t.common.preview}</Pill>}
              <span className="hidden sm:inline">{l.venue.default}</span>
            </div>
          </div>
          <a href={`/teams/${l.homeTeam.abbrev}`} className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
            <TeamLogo abbrev={l.homeTeam.abbrev} size={64} />
            <span className="text-center sm:text-left">
              <span className="block font-display text-2xl font-bold uppercase leading-none tracking-wide sm:text-3xl">{l.homeTeam.abbrev}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t.game.home}</span>
            </span>
          </a>
        </div>
        <p className="mt-3 text-center text-xs text-muted sm:hidden">{l.venue.default}</p>
      </header>
      <Suspense fallback={<SkeletonCards n={2} h={240} />}>
        {pre ? <Preview id={id} date={l.gameDate} /> : <BoxScore id={id} />}
      </Suspense>
    </>
  );
}

async function Preview({ id, date }: { id: number; date: string }) {
  const { t, f, locale } = await getI18n();
  const slate = await buildSlate(date, locale);
  const card = slate.cards.find((c) => c.game.id === id);
  if (!card) return <Empty>{t.game.noPreview}</Empty>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GameCardView card={card} showAll />
      <Card className="overflow-x-auto !p-0">
        <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">{t.game.projections}</h2>
        <table className="tabular mt-2 w-full min-w-[480px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left">{t.game.projCols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {[...card.props].sort((a, b) => b.pPoint1 - a.pPoint1).map((p) => (
              <tr key={p.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
                <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${p.playerId}`}>{p.name}</a></td>
                <td className="text-muted">{p.team}</td>
                <td>{f.num(p.goalRate, 2)}</td>
                <td className="text-ink-2">{p.last10.gp ? t.stats.goalsPoints(p.last10.goals, p.last10.points) : "–"}</td>
                <td>{f.pct(p.pGoal)}</td><td>{f.pct(p.pPoint1)}</td><td>{f.pct(p.pPoint2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-3 text-xs text-muted">{t.game.projNote}</p>
      </Card>
    </div>
  );
}

async function BoxScore({ id }: { id: number }) {
  const { t, f } = await getI18n();
  const [box, landing] = await Promise.all([api.boxscore(id), api.landing(id)]);
  const b = box.data;
  const summary = landing.data?.summary;
  const picks = sqlite.prepare("SELECT market, selection, line, selection_label AS label, model_prob AS p, edge, result, is_best AS best FROM picks WHERE game_id = ? ORDER BY market").all(id) as {
    market: Market;
    selection: string;
    line: number | null;
    label: string;
    p: number;
    edge: number | null;
    result: string | null;
    best: number;
  }[];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <StaleBanner items={[box, landing]} />
        {summary && (
          <Card>
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{t.game.scoring}</h2>
            {summary.scoring.map((p) => (
              <div key={`${p.periodDescriptor.number}${p.periodDescriptor.periodType}`} className="mb-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t.status.periodLong(p.periodDescriptor.number, p.periodDescriptor.periodType)}</div>
                {p.goals.length === 0 ? <p className="text-sm text-muted">{t.game.noGoals}</p> : (
                  <ul className="text-sm">
                    {p.goals.map((g) => (
                      <li key={g.eventId} className="flex gap-2 py-0.5">
                        <span className="w-12 tabular text-muted">{g.timeInPeriod}</span>
                        <span className="w-10 font-display font-bold">{g.teamAbbrev.default}</span>
                        <span className="flex-1">
                          <a className="hover:text-accent-2" href={`/players/${g.playerId}`}>{g.name.default}</a> ({g.goalsToDate})
                          {g.assists.length > 0 && <span className="text-ink-2"> · {g.assists.map((a) => a.name.default).join(", ")}</span>}
                          {g.strength !== "ev" && <span className="ml-1"><Pill>{t.stats.strength(g.strength)}</Pill></span>}
                        </span>
                        <span className="tabular text-muted">{g.awayScore}–{g.homeScore}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Card>
        )}
        {b?.playerByGameStats && (["awayTeam", "homeTeam"] as const).map((side) => (
          <TeamBox key={side} i={{ t, f }} abbrev={b[side].abbrev} sog={b[side].sog} stats={b.playerByGameStats![side]} />
        ))}
      </div>
      <div className="space-y-4">
        {summary?.threeStars?.length ? (
          <Card>
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{t.game.threeStars}</h2>
            <ol className="space-y-1 text-sm">
              {summary.threeStars.map((s) => (
                <li key={s.star} className="flex gap-2">
                  <span className="text-warn">{"★".repeat(s.star)}</span>
                  <a className="hover:text-accent-2" href={`/players/${s.playerId}`}>{s.name.default}</a>
                  <span className="text-muted">{s.teamAbbrev}</span>
                  <span className="ml-auto tabular text-ink-2">{s.position === "G" ? (s.savePctg ? `${f.svPct(s.savePctg)} ${t.stats.sv}` : "") : t.stats.goalsAssists(s.goals ?? 0, s.assists ?? 0)}</span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}
        <Card>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">{t.game.modelPicks}</h2>
          {picks.length ? (
            <ul className="space-y-1 text-sm">
              {picks.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="flex-1">{pickLabel(t, p.market, p.selection, p.line, p.label)} <span className="text-xs text-muted">{t.markets[p.market]}</span></span>
                  <span className="tabular text-ink-2">{f.pct(p.p)}</span>
                  <Pill tone={p.result === "win" ? "good" : p.result === "loss" ? "bad" : "neutral"}>{t.result[p.result ?? "pending"] ?? p.result}</Pill>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{t.game.noPicks}</p>}
        </Card>
      </div>
    </div>
  );
}

function TeamBox({ i: { t, f }, abbrev, sog, stats }: { i: Pick<I18n, "t" | "f">; abbrev: string; sog: number; stats: BoxTeamStats }) {
  const s = t.stats;
  return (
    <Card className="overflow-x-auto !p-0">
      <h2 className="flex items-center gap-2 px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide"><TeamLogo abbrev={abbrev} size={20} />{abbrev} <span className="font-normal text-muted">{t.game.shots(sog)}</span></h2>
      <table className="tabular mt-2 w-full min-w-[520px] text-sm">
        <thead className="text-xs text-muted">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>{t.game.skater}</th><th>{s.pos}</th><th>{s.g}</th><th>{s.a}</th><th>{s.p}</th><th>{s.sog}</th><th>{s.pm}</th><th>{s.hits}</th><th>{s.toi}</th></tr>
        </thead>
        <tbody>
          {[...stats.forwards, ...stats.defense].sort((a, b) => b.points - a.points || b.sog - a.sog).map((s) => (
            <tr key={s.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
              <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${s.playerId}`}>{s.name.default}</a></td>
              <td className="text-muted">{t.stats.position(s.position)}</td><td>{s.goals}</td><td>{s.assists}</td><td className="font-semibold">{s.points}</td>
              <td>{s.sog}</td><td>{s.plusMinus > 0 ? "+" : ""}{s.plusMinus}</td><td>{s.hits}</td><td>{s.toi}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="tabular mb-2 mt-2 w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>{t.common.goalie}</th><th>{s.sa}</th><th>{s.saves}</th><th>{s.sv}</th><th>{s.toi}</th><th>{s.dec}</th></tr>
        </thead>
        <tbody>
          {stats.goalies.filter((g) => g.toi !== "00:00").map((g) => (
            <tr key={g.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
              <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${g.playerId}`}>{g.name.default}</a>{g.starter && <span className="ml-1 text-xs text-muted">{t.game.starter}</span>}</td>
              <td>{g.shotsAgainst}</td><td>{g.saves}</td><td>{g.savePctg !== undefined ? f.svPct(g.savePctg) : "–"}</td><td>{g.toi}</td><td>{g.decision ? t.stats.decision(g.decision) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
