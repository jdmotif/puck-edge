import { Suspense } from "react";
import { sqlite } from "@/db";
import { api } from "@/lib/nhl/client";
import { buildSlate } from "@/lib/picks";
import type { BoxTeamStats } from "@/lib/nhl/types";
import { GameCardView } from "@/components/GameCardView";
import { LocalTime } from "@/components/LocalTime";
import { Card, Empty, Pill, SkeletonCards, StaleBanner, TEAM_COLORS, TeamLogo } from "@/components/ui";
import { MARKET_LABELS, type Market } from "@/lib/grading";
import { pct, svPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const landing = await api.landing(id);
  const l = landing.data;
  if (!l) return <><StaleBanner items={[landing]} /><Empty>This game couldn&apos;t be loaded.</Empty></>;
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
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Away</span>
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
                <Pill>Final{l.gameOutcome && l.gameOutcome.lastPeriodType !== "REG" ? `/${l.gameOutcome.lastPeriodType}` : ""}</Pill>
              ) : l.gameState === "LIVE" || l.gameState === "CRIT" ? (
                <Pill tone="bad"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bad" />Live</Pill>
              ) : <Pill tone="accent">Preview</Pill>}
              <span className="hidden sm:inline">{l.venue.default}</span>
            </div>
          </div>
          <a href={`/teams/${l.homeTeam.abbrev}`} className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
            <TeamLogo abbrev={l.homeTeam.abbrev} size={64} />
            <span className="text-center sm:text-left">
              <span className="block font-display text-2xl font-bold uppercase leading-none tracking-wide sm:text-3xl">{l.homeTeam.abbrev}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Home</span>
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
  const slate = await buildSlate(date);
  const card = slate.cards.find((c) => c.game.id === id);
  if (!card) return <Empty>No preview available for this game yet.</Empty>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GameCardView card={card} showAll />
      <Card className="overflow-x-auto !p-0">
        <h2 className="px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide">Player projections</h2>
        <table className="tabular mt-2 w-full min-w-[480px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>Player</th><th>Team</th><th>G/GP</th><th>Last 10</th><th>Goal</th><th>1+ pt</th><th>2+ pts</th></tr>
          </thead>
          <tbody>
            {[...card.props].sort((a, b) => b.pPoint1 - a.pPoint1).map((p) => (
              <tr key={p.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
                <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${p.playerId}`}>{p.name}</a></td>
                <td className="text-muted">{p.team}</td>
                <td>{p.goalRate.toFixed(2)}</td>
                <td className="text-ink-2">{p.last10.gp ? `${p.last10.goals}G ${p.last10.points}P` : "–"}</td>
                <td>{pct(p.pGoal)}</td><td>{pct(p.pPoint1)}</td><td>{pct(p.pPoint2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-3 text-xs text-muted">Probabilities from a Poisson model of each player&apos;s blended per-game rate, adjusted for tonight&apos;s matchup, ice time trend and the opposing goalie.</p>
      </Card>
    </div>
  );
}

async function BoxScore({ id }: { id: number }) {
  const [box, landing] = await Promise.all([api.boxscore(id), api.landing(id)]);
  const b = box.data;
  const summary = landing.data?.summary;
  const picks = sqlite.prepare("SELECT market, selection_label AS label, model_prob AS p, edge, result, is_best AS best FROM picks WHERE game_id = ? ORDER BY market").all(id) as {
    market: Market;
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
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Scoring</h2>
            {summary.scoring.map((p) => (
              <div key={`${p.periodDescriptor.number}${p.periodDescriptor.periodType}`} className="mb-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{p.periodDescriptor.periodType === "REG" ? `Period ${p.periodDescriptor.number}` : p.periodDescriptor.periodType}</div>
                {p.goals.length === 0 ? <p className="text-sm text-muted">No goals</p> : (
                  <ul className="text-sm">
                    {p.goals.map((g) => (
                      <li key={g.eventId} className="flex gap-2 py-0.5">
                        <span className="w-12 tabular text-muted">{g.timeInPeriod}</span>
                        <span className="w-10 font-display font-bold">{g.teamAbbrev.default}</span>
                        <span className="flex-1">
                          <a className="hover:text-accent-2" href={`/players/${g.playerId}`}>{g.name.default}</a> ({g.goalsToDate})
                          {g.assists.length > 0 && <span className="text-ink-2"> · {g.assists.map((a) => a.name.default).join(", ")}</span>}
                          {g.strength !== "ev" && <span className="ml-1"><Pill>{g.strength.toUpperCase()}</Pill></span>}
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
          <TeamBox key={side} abbrev={b[side].abbrev} sog={b[side].sog} stats={b.playerByGameStats![side]} />
        ))}
      </div>
      <div className="space-y-4">
        {summary?.threeStars?.length ? (
          <Card>
            <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Three stars</h2>
            <ol className="space-y-1 text-sm">
              {summary.threeStars.map((s) => (
                <li key={s.star} className="flex gap-2">
                  <span className="text-warn">{"★".repeat(s.star)}</span>
                  <a className="hover:text-accent-2" href={`/players/${s.playerId}`}>{s.name.default}</a>
                  <span className="text-muted">{s.teamAbbrev}</span>
                  <span className="ml-auto tabular text-ink-2">{s.position === "G" ? (s.savePctg ? `${svPct(s.savePctg)} SV%` : "") : `${s.goals ?? 0}G ${s.assists ?? 0}A`}</span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}
        <Card>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide">Model picks for this game</h2>
          {picks.length ? (
            <ul className="space-y-1 text-sm">
              {picks.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="flex-1">{p.label} <span className="text-xs text-muted">{MARKET_LABELS[p.market]}</span></span>
                  <span className="tabular text-ink-2">{pct(p.p)}</span>
                  <Pill tone={p.result === "win" ? "good" : p.result === "loss" ? "bad" : "neutral"}>{p.result ?? "pending"}</Pill>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">The model didn&apos;t log picks for this game.</p>}
        </Card>
      </div>
    </div>
  );
}

function TeamBox({ abbrev, sog, stats }: { abbrev: string; sog: number; stats: BoxTeamStats }) {
  return (
    <Card className="overflow-x-auto !p-0">
      <h2 className="flex items-center gap-2 px-3 pt-3 font-display text-lg font-bold uppercase tracking-wide"><TeamLogo abbrev={abbrev} size={20} />{abbrev} <span className="font-normal text-muted">{sog} shots</span></h2>
      <table className="tabular mt-2 w-full min-w-[520px] text-sm">
        <thead className="text-xs text-muted">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>Skater</th><th>Pos</th><th>G</th><th>A</th><th>P</th><th>SOG</th><th>+/-</th><th>Hits</th><th>TOI</th></tr>
        </thead>
        <tbody>
          {[...stats.forwards, ...stats.defense].sort((a, b) => b.points - a.points || b.sog - a.sog).map((s) => (
            <tr key={s.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
              <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${s.playerId}`}>{s.name.default}</a></td>
              <td className="text-muted">{s.position}</td><td>{s.goals}</td><td>{s.assists}</td><td className="font-semibold">{s.points}</td>
              <td>{s.sog}</td><td>{s.plusMinus > 0 ? "+" : ""}{s.plusMinus}</td><td>{s.hits}</td><td>{s.toi}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="tabular mb-2 mt-2 w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>Goalie</th><th>SA</th><th>SV</th><th>SV%</th><th>TOI</th><th>Dec</th></tr>
        </thead>
        <tbody>
          {stats.goalies.filter((g) => g.toi !== "00:00").map((g) => (
            <tr key={g.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
              <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${g.playerId}`}>{g.name.default}</a>{g.starter && <span className="ml-1 text-xs text-muted">starter</span>}</td>
              <td>{g.shotsAgainst}</td><td>{g.saves}</td><td>{g.savePctg !== undefined ? svPct(g.savePctg) : "–"}</td><td>{g.toi}</td><td>{g.decision ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
