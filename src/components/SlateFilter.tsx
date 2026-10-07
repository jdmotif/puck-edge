"use client";
// Filter chips over the slate's game cards. The cards are server-rendered; this only toggles which
// ones show (by their data-value / data-state attributes, see globals.css), so it works the same in
// the app and on the online copy.
import { useEffect, useState, type ReactNode } from "react";

export type SlateFilterKey = "all" | "value" | "upcoming" | "live" | "final";

export function SlateFilter({ counts, labels, aria, children }: {
  counts: Record<SlateFilterKey, number>;
  labels: Record<string, string>;
  aria: string;
  children: ReactNode;
}) {
  const [filter, setFilter] = useState<SlateFilterKey>("all");
  // Jumping to a game from the Best bets list must land on a visible card.
  useEffect(() => {
    const reset = () => setFilter("all");
    window.addEventListener("hashchange", reset);
    return () => window.removeEventListener("hashchange", reset);
  }, []);
  const keys = (["all", "value", "upcoming", "live", "final"] as const).filter((k) => k === "all" || k === "value" || counts[k] > 0);
  return (
    <>
      <div role="group" aria-label={aria} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {keys.map((k) => {
          const on = filter === k;
          const disabled = counts[k] === 0 && k !== "all";
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => setFilter(k)}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? "border-accent/60 bg-accent text-white shadow-[0_4px_14px_-6px_var(--accent)]" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              {k === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bad" />}
              {labels[k]}
              <span className={`tabular rounded-full px-1.5 text-xs ${on ? "bg-white/20" : "bg-surface-3 text-muted"}`}>{counts[k]}</span>
            </button>
          );
        })}
      </div>
      <div className="slate grid gap-4 xl:grid-cols-2" data-filter={filter}>
        {children}
      </div>
    </>
  );
}
