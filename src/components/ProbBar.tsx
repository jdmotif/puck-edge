/** Two-sided win probability bar: away on the left, home on the right. The favourite's number is emphasised. */
export function ProbBar({ away, home, awayLabel, homeLabel, awayPct, homePct, aria }: {
  away: number;
  home: number;
  awayLabel: string;
  homeLabel: string;
  awayPct: string;
  homePct: string;
  aria: string;
}) {
  const fav = away > home ? "away" : home > away ? "home" : null;
  return (
    <div>
      <div className="flex items-end justify-between tabular">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{awayLabel}</div>
          <div className={`font-display text-2xl font-bold leading-none ${fav === "away" ? "text-ink" : "text-ink-2"}`}>{awayPct}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{homeLabel}</div>
          <div className={`font-display text-2xl font-bold leading-none ${fav === "home" ? "text-ink" : "text-ink-2"}`}>{homePct}</div>
        </div>
      </div>
      <div className="mt-2 flex h-2.5 gap-1 overflow-hidden rounded-full" role="img" aria-label={aria}>
        <div className="rounded-l-full bg-gradient-to-r from-s2/70 to-s2" style={{ width: `${away * 100}%` }} />
        <div className="rounded-r-full bg-gradient-to-r from-s1 to-s1/70" style={{ width: `${home * 100}%` }} />
      </div>
    </div>
  );
}
