import type { Pick } from "@/lib/picks";
import { getI18n } from "@/lib/i18n/server";
import { Pill } from "./ui";
import { LocalTime } from "./LocalTime";

/** A pick that switched before puck drop: when, what it was, and why. */
export interface PickChangeNote {
  at: string; // ISO
  from: string;
  why: string[];
}

const confTone = { High: "good", Medium: "accent", Low: "neutral" } as const;

export async function PickCard({ pick, best = false, lean = false, betHref, change }: { pick: Pick; best?: boolean; lean?: boolean; betHref?: string; change?: PickChangeNote }) {
  const { t, f } = await getI18n();
  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-3.5 ${
        best ? "border-accent/50 bg-gradient-to-br from-accent/15 via-accent/5 to-transparent" : "border-line bg-surface-2/50"
      }`}
    >
      {best && <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/20 blur-2xl" />}
      <div className="relative flex flex-wrap items-center gap-2">
        {best && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">{t.pick.best}</span>}
        {lean && <span className="rounded-md border border-line-strong px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-2">{t.pick.lean}</span>}
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t.markets[pick.market]}</span>
        <span className="ml-auto flex gap-1">
          {pick.isValue && <Pill tone="edge">{t.pick.value}</Pill>}
          {pick.odds === null && <Pill>{t.pick.modelOnly}</Pill>}
          <Pill tone={confTone[pick.confidence]}>{t.confidence[pick.confidence]}</Pill>
        </span>
      </div>

      {change && (
        <p className="relative mt-1.5 text-xs text-warn">
          ↻ {t.pick.changed} <LocalTime iso={change.at} /> · {[t.pick.was(change.from), ...change.why].join(" · ")}
        </p>
      )}

      <div className="relative mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="font-display text-xl font-bold uppercase leading-tight tracking-wide">{pick.label}</div>
          {pick.odds && (
            <div className="tabular text-xs text-ink-2">
              <span className="font-semibold text-ink">{f.american(pick.odds)}</span> ({f.decimal(pick.odds)}){pick.book ? t.pick.atBook(pick.book) : ""}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-3 text-right tabular">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{t.pick.model}</div>
            <div className="font-display text-lg font-bold leading-none">{f.pct(pick.modelProb, 1)}</div>
          </div>
          {pick.marketProb !== null && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{t.pick.market}</div>
              <div className="font-display text-lg font-bold leading-none text-ink-2">{f.pct(pick.marketProb, 1)}</div>
            </div>
          )}
          {pick.edge !== null && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{t.pick.edge}</div>
              <div className={`font-display text-lg font-bold leading-none ${pick.edge >= 0 ? "text-edge" : "text-bad"}`}>{f.signedPct(pick.edge)}</div>
            </div>
          )}
        </div>
      </div>

      {pick.blendProb !== null && pick.blendWeight !== null && (
        <p className="relative mt-2 text-xs text-muted">{t.pick.blendNote(f.pct(pick.blendProb, 1), f.pct(pick.blendWeight))}</p>
      )}

      {pick.reasons.length > 0 && (
        <ul className="relative mt-3 space-y-1 border-t border-line pt-2.5 text-sm text-ink-2">
          {pick.reasons.map((r) => (
            <li key={r} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent-2" />{r}</li>
          ))}
        </ul>
      )}
      {(betHref || (pick.stake !== null && pick.stake > 0)) && (
        <div className="relative mt-3 flex items-center justify-between gap-2">
          {pick.stake !== null && pick.stake > 0 ? <span className="tabular text-xs text-muted">{t.pick.kellyStake} <span className="font-semibold text-ink-2">{f.money(pick.stake)}</span></span> : <span />}
          {betHref && (
            <a href={betHref} className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-2 hover:bg-accent/20">
              {t.pick.logBet}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
