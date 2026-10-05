import type { Pick } from "@/lib/picks";
import { MARKET_LABELS } from "@/lib/grading";
import { american, pct, signedPct } from "@/lib/format";
import { Pill } from "./ui";

const confTone = { High: "good", Medium: "accent", Low: "neutral" } as const;

export function PickCard({ pick, best = false, betHref }: { pick: Pick; best?: boolean; betHref?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-3.5 ${
        best ? "border-accent/50 bg-gradient-to-br from-accent/15 via-accent/5 to-transparent" : "border-line bg-surface-2/50"
      }`}
    >
      {best && <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/20 blur-2xl" />}
      <div className="relative flex flex-wrap items-center gap-2">
        {best && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">Best pick</span>}
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{MARKET_LABELS[pick.market]}</span>
        <span className="ml-auto flex gap-1">
          {pick.isValue && <Pill tone="edge">Value</Pill>}
          {pick.odds === null && <Pill>Model only</Pill>}
          <Pill tone={confTone[pick.confidence]}>{pick.confidence}</Pill>
        </span>
      </div>

      <div className="relative mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="font-display text-xl font-bold uppercase leading-tight tracking-wide">{pick.label}</div>
          {pick.odds && (
            <div className="tabular text-xs text-ink-2">
              <span className="font-semibold text-ink">{american(pick.odds)}</span> ({pick.odds.toFixed(2)}){pick.book ? ` at ${pick.book}` : ""}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-3 text-right tabular">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Model</div>
            <div className="font-display text-lg font-bold leading-none">{pct(pick.modelProb, 1)}</div>
          </div>
          {pick.marketProb !== null && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Market</div>
              <div className="font-display text-lg font-bold leading-none text-ink-2">{pct(pick.marketProb, 1)}</div>
            </div>
          )}
          {pick.edge !== null && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Edge</div>
              <div className={`font-display text-lg font-bold leading-none ${pick.edge >= 0 ? "text-edge" : "text-bad"}`}>{signedPct(pick.edge)}</div>
            </div>
          )}
        </div>
      </div>

      {pick.reasons.length > 0 && (
        <ul className="relative mt-3 space-y-1 border-t border-line pt-2.5 text-sm text-ink-2">
          {pick.reasons.map((r) => (
            <li key={r} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent-2" />{r}</li>
          ))}
        </ul>
      )}
      {(betHref || (pick.stake !== null && pick.stake > 0)) && (
        <div className="relative mt-3 flex items-center justify-between gap-2">
          {pick.stake !== null && pick.stake > 0 ? <span className="tabular text-xs text-muted">Kelly stake <span className="font-semibold text-ink-2">${pick.stake.toFixed(2)}</span></span> : <span />}
          {betHref && (
            <a href={betHref} className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-2 hover:bg-accent/20">
              Log bet →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
