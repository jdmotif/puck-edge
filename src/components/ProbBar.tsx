/** Two-sided win probability bar: away on the left, home on the right. */
export function ProbBar({ away, home, awayLabel, homeLabel }: { away: number; home: number; awayLabel: string; homeLabel: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-ink-2 tabular">
        <span>{awayLabel} {(away * 100).toFixed(0)}%</span>
        <span>{(home * 100).toFixed(0)}% {homeLabel}</span>
      </div>
      <div className="mt-1 flex h-2 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`${awayLabel} ${(away * 100).toFixed(0)}%, ${homeLabel} ${(home * 100).toFixed(0)}%`}>
        <div className="rounded-l-full bg-s2" style={{ width: `${away * 100}%` }} />
        <div className="rounded-r-full bg-s1" style={{ width: `${home * 100}%` }} />
      </div>
    </div>
  );
}
