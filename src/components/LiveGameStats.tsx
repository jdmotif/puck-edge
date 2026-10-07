"use client";
// Player stats of a started game: the scoring sheet and each team's player box on the game page, and
// a short scorers list on game cards. The page renders them from its own data; on the online copy
// they switch to the minute files of the live-scores workflow as those come in (see LiveScore.tsx).
import { DONE_STATES, LIVE_STATES, scoringPeriods, type LiveBox, type LiveGoal, type LiveTeamBox } from "@/lib/live/feed";
import { useI18n } from "@/lib/i18n/client";
import { useLiveBox, useLiveGame } from "./LiveScore";
import { Card, Pill, TeamLogo } from "./ui";

export interface GameStatsData {
  state: string;
  period: number | null;
  periodType: string | null;
  goals: LiveGoal[];
  box: LiveBox | null;
}

const H2 = "font-display text-lg font-bold uppercase tracking-wide";

/** Scoring sheet and player boxes; renders nothing until the game has started. */
export function LiveGameStats({ id, initial }: { id: number; initial: GameStatsData | null }) {
  const { t } = useI18n();
  const live = useLiveGame(id);
  const liveBox = useLiveBox(id);
  const state = live?.state ?? initial?.state ?? "FUT";
  const goals = live?.goals ?? initial?.goals ?? [];
  const box = liveBox ?? initial?.box ?? null;
  const current = live ?? initial;
  if (!current || !(LIVE_STATES.has(state) || DONE_STATES.has(state))) return null;
  const periods = scoringPeriods(goals, current);
  const inProgress = LIVE_STATES.has(state);
  return (
    <>
      <Card>
        <h2 className={`mb-2 flex items-center gap-2 ${H2}`}>
          {t.game.scoring}
          {inProgress && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bad" />}
        </h2>
        {periods.length === 0 && <p className="text-sm text-muted">{t.game.noGoals}</p>}
        {periods.map((p) => {
          const list = goals.filter((g) => g.period === p.period);
          return (
            <div key={p.period} className="mb-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t.status.periodLong(p.period, p.periodType)}</div>
              {list.length === 0 ? <p className="text-sm text-muted">{t.game.noGoals}</p> : (
                <ul className="text-sm">
                  {list.map((g) => (
                    <li key={`${g.period}-${g.time}-${g.playerId}`} className="flex gap-2 py-0.5">
                      <span className="w-12 tabular text-muted">{g.time}</span>
                      <span className="w-10 font-display font-bold">{g.team}</span>
                      <span className="flex-1">
                        <a className="hover:text-accent-2" href={`/players/${g.playerId}`}>{g.name}</a> ({g.goalsToDate})
                        {g.assists.length > 0 && (
                          <span className="text-ink-2"> · {g.assists.map((a, k) => (
                            <span key={a.playerId}>{k > 0 && ", "}<a className="hover:text-accent-2" href={`/players/${a.playerId}`}>{a.name}</a> ({a.assistsToDate})</span>
                          ))}</span>
                        )}
                        {g.strength !== "ev" && <span className="ml-1"><Pill>{t.stats.strength(g.strength)}</Pill></span>}
                      </span>
                      <span className="tabular text-muted">{g.away}–{g.home}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {inProgress && <p className="mt-1 text-xs text-muted">{t.game.updating}</p>}
      </Card>
      {box && <TeamBox team={box.away} />}
      {box && <TeamBox team={box.home} />}
    </>
  );
}

function TeamBox({ team }: { team: LiveTeamBox }) {
  const { t, f } = useI18n();
  const s = t.stats;
  return (
    <Card className="overflow-x-auto !p-0">
      <h2 className={`flex items-center gap-2 px-3 pt-3 ${H2}`}><TeamLogo abbrev={team.abbrev} size={20} />{team.abbrev} <span className="font-normal text-muted">{t.game.shots(team.sog)}</span></h2>
      <table className="tabular mt-2 w-full min-w-[520px] text-sm">
        <thead className="text-xs text-muted">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>{t.game.skater}</th><th>{s.pos}</th><th>{s.g}</th><th>{s.a}</th><th>{s.p}</th><th>{s.sog}</th><th>{s.pm}</th><th>{s.hits}</th><th>{s.toi}</th></tr>
        </thead>
        <tbody>
          {[...team.skaters].sort((a, b) => b.points - a.points || b.goals - a.goals || b.sog - a.sog).map((p) => (
            <tr key={p.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
              <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${p.playerId}`}>{p.name}</a></td>
              <td className="text-muted">{s.position(p.position)}</td><td>{p.goals}</td><td>{p.assists}</td><td className="font-semibold">{p.points}</td>
              <td>{p.sog}</td><td>{p.plusMinus > 0 ? "+" : ""}{p.plusMinus}</td><td>{p.hits}</td><td>{p.toi}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="tabular mb-2 mt-2 w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left"><th>{t.common.goalie}</th><th>{s.sa}</th><th>{s.saves}</th><th>{s.sv}</th><th>{s.toi}</th><th>{s.dec}</th></tr>
        </thead>
        <tbody>
          {team.goalies.map((g) => (
            <tr key={g.playerId} className="border-t border-line [&>td]:px-2 [&>td]:py-2 [&>td]:text-right">
              <td className="!text-left"><a className="hover:text-accent-2" href={`/players/${g.playerId}`}>{g.name}</a>{g.starter && <span className="ml-1 text-xs text-muted">{t.game.starter}</span>}</td>
              <td>{g.shotsAgainst}</td><td>{g.saves}</td><td>{g.savePctg !== null ? f.svPct(g.savePctg) : "–"}</td><td>{g.toi}</td><td>{g.decision ? s.decision(g.decision) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Who scored, by team, under the score on a game card. */
export function LiveScorers({ id, away, home, initial }: { id: number; away: string; home: string; initial: LiveGoal[] }) {
  const { t } = useI18n();
  const live = useLiveGame(id);
  const goals = live?.goals ?? initial;
  if (!goals.length) return null;
  const side = (team: string, right: boolean) => (
    <ul className={`min-w-0 space-y-0.5 ${right ? "text-right" : ""}`} aria-label={t.card.scorers(team)}>
      {goals.filter((g) => g.team === team).map((g) => (
        <li key={`${g.period}-${g.time}-${g.playerId}`} className="truncate">
          <a className="text-ink-2 hover:text-accent-2" href={`/players/${g.playerId}`}>{g.name}</a>
          <span className="tabular text-muted"> {t.status.period(g.period, g.periodType)} {g.time}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2/50 px-3 py-2 text-xs">
      {side(away, false)}
      {side(home, true)}
    </div>
  );
}
