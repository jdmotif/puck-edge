import type { StandingRow } from "@/lib/nhl/types";
import { TeamLogo } from "./ui";
import { getI18n } from "@/lib/i18n/server";

export async function StandingsTable({ rows, title, cutAfter }: { rows: StandingRow[]; title?: string; cutAfter?: number }) {
  const { t, f } = await getI18n();
  const s = t.stats;
  return (
    <div className="card overflow-x-auto">
      {title && <div className="border-b border-line px-4 py-3 font-display text-lg font-bold uppercase tracking-wide">{title}</div>}
      <table className="tabular w-full min-w-[720px] text-sm">
        <thead className="text-xs text-muted">
          <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-right [&>th:first-child]:text-left [&>th:nth-child(2)]:text-left">
            <th className="!pl-4">#</th><th>{t.common.team}</th><th>{s.gp}</th><th>{s.w}</th><th>{s.l}</th><th>{s.otl}</th><th>{s.pts}</th><th>{s.pPct}</th><th>{s.gf}</th><th>{s.ga}</th><th>{s.diff}</th><th>{t.standings.home}</th><th>{t.standings.road}</th><th>{s.l10}</th><th>{s.strk}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.teamAbbrev.default} className={`border-t border-line [&>td]:px-2 [&>td]:py-2.5 [&>td]:text-right ${cutAfter && i === cutAfter ? "border-t-2 border-t-accent/60" : ""}`}>
              <td className="!pl-4 !text-left text-muted">{i + 1}</td>
              <td className="!text-left">
                <a href={`/teams/${r.teamAbbrev.default}`} className="flex items-center gap-2 hover:text-accent-2">
                  <TeamLogo abbrev={r.teamAbbrev.default} size={26} />
                  <span className="font-medium">{r.teamAbbrev.default}</span>
                  <span className="hidden text-muted sm:inline">{r.teamCommonName.default}</span>
                </a>
              </td>
              <td>{r.gamesPlayed}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.otLosses}</td>
              <td className="font-display text-base font-bold">{r.points}</td>
              <td>{f.svPct(r.pointPctg)}</td>
              <td>{r.goalFor}</td><td>{r.goalAgainst}</td>
              <td className={r.goalDifferential > 0 ? "text-good" : r.goalDifferential < 0 ? "text-bad" : ""}>{r.goalDifferential > 0 ? "+" : ""}{r.goalDifferential}</td>
              <td className="text-ink-2">{r.homeWins}-{r.homeLosses}-{r.homeOtLosses}</td>
              <td className="text-ink-2">{r.roadWins}-{r.roadLosses}-{r.roadOtLosses}</td>
              <td className="text-ink-2">{r.l10Wins}-{r.l10Losses}-{r.l10OtLosses}</td>
              <td className="text-ink-2">{r.streakCode ? s.streak(r.streakCode, r.streakCount ?? 0) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
