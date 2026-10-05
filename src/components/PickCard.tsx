import type { Pick } from "@/lib/picks";
import { MARKET_LABELS } from "@/lib/grading";
import { american, pct, signedPct } from "@/lib/format";
import { Pill } from "./ui";

const confTone = { High: "good", Medium: "accent", Low: "neutral" } as const;

export function PickCard({ pick, best = false, betHref }: { pick: Pick; best?: boolean; betHref?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${best ? "border-accent/60 bg-accent/5" : "border-line bg-surface-2/40"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {best && <span className="text-xs font-semibold uppercase tracking-wide text-accent">Best pick</span>}
        <span className="text-xs text-muted">{MARKET_LABELS[pick.market]}</span>
        <span className="ml-auto flex gap-1">
          {pick.isValue && <Pill tone="good">Value pick</Pill>}
          {pick.odds === null && <Pill>Model only</Pill>}
          <Pill tone={confTone[pick.confidence]}>{pick.confidence}</Pill>
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="text-base font-semibold">{pick.label}</div>
        <div className="tabular text-sm text-ink-2">
          Model <span className="font-semibold text-ink">{pct(pick.modelProb, 1)}</span>
          {pick.marketProb !== null && <> · Market {pct(pick.marketProb, 1)}</>}
        </div>
      </div>
      {pick.edge !== null && (
        <div className="mt-0.5 tabular text-xs text-ink-2">
          Edge <span className={pick.edge >= 0 ? "text-good" : "text-bad"}>{signedPct(pick.edge)}</span>
          {pick.odds && <> · Best price {american(pick.odds)} ({pick.odds.toFixed(2)}){pick.book ? ` at ${pick.book}` : ""}</>}
          {pick.stake !== null && pick.stake > 0 && <> · Kelly stake ${pick.stake.toFixed(2)}</>}
        </div>
      )}
      {pick.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-ink-2">
          {pick.reasons.map((r) => (
            <li key={r} className="flex gap-1.5"><span className="text-muted">•</span>{r}</li>
          ))}
        </ul>
      )}
      {betHref && <a href={betHref} className="mt-2 inline-block text-xs text-accent hover:underline">Log a bet on this →</a>}
    </div>
  );
}
